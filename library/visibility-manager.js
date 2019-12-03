/**
 * Copyright 2019 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 *
 * @fileoverview This file provides the class backing the virtual-scroller
 *    element.
 * @package
 */
import * as findElement from './find-element.js';
import * as sets from './sets.js';


// This controls how much above and below the current screen we
// reveal, e.g. 1 = 1 screen of content.
const BUFFER = 0.2;
// When we know about the heights of elements we default this height.
const DEFAULT_HEIGHT_ESTIMATE_PX = 100;
// When we lock an element, we use this as the width. We use 1px because locked
// items will not resize when their container changes and so could result in a
// horizontal scroll-bar appearing if it they are wide enough.
const LOCKED_WIDTH_PX = 1;

/**
 * Represents a range of elements from |low| to |high|, inclusive.
 * If either |low| or |high| are null then we treat this as an empty range.
 */
class ElementBounds {
  /** @const {Element[]} */
  elements;
  /** @const {Number} */
  low;
  /** @const {Number} */
  high;

  constructor(elements, low, high) {
    this.elements = elements;
    this.low = low;
    this.high = high;
  }

  first() {
    if (this.low === -1)
      return null;
    return this.elements[this.low];
  }

  last() {
    if (this.high === -1)
      return null;
    return this.elements[this.high];
  }

  size() {
    if (this.low == -1 || this.high == -1)
      return 0;
    return this.high - this.low + 1;
  }

  expand(n) {
    if (this.low == -1 || this.high == -1)
      return;
    this.low = Math.max(0, this.low - n);
    this.high = Math.min(this.elements.length - 1, this.high + n);
  }

  // Returns a Set containing all of the elements from low to high.
  elementSet() {
    const result = new Set();
    if (this.low === -1 || this.high === -1) {
      return result;
    }
    let element = this.elements[this.low];
    while (element) {
      result.add(element);
      if (element === this.elements[this.high]) {
        break;
      }
      element = element.nextElementSibling;
    }
    return result;
  }
}

const EMPTY_ELEMENT_BOUNDS = new ElementBounds([], -1, -1);
const USE_FALLBACK = !getComputedStyle(document.body).intrinsicSize;

/**
 * Manages measuring and estimating sizes of elements.
 *
 * This tracks an average measured element size as elements are added
 * and removed.
 */
class SizeManager {
  #sizes = new WeakMap();

  #totalMeasuredSize = 0;
  #measuredCount = 0;

  /**
   * Measures and stores |element|'s size. If |element| was measured
   * previously, this updates everything to use the new current size.
   *
   * @param {!Element} element The element to measure.
   */
  measure(element) {
    let oldSize = this.#sizes.get(element);
    if (oldSize === undefined) {
      oldSize = 0;
      this.#measuredCount++;
    }
    const newSize = element.getBoundingClientRect().height;
    this.#totalMeasuredSize += newSize - oldSize;
    this.#sizes.set(element, newSize);
  }

  /**
   * Returns a size for |element|, either the last stored size or an
   * estimate based on all other previously measured elements or a
   * default.
   *
   * @param {!Element} element The element to produce a size for.
   */
  getHopefulSize(element) {
    const size = this.#sizes.get(element);
    return size === undefined ? this.getAverageSize() : size;
  }

  getAverageSize =
      () => {
        return this.#measuredCount > 0 ?
            this.#totalMeasuredSize / this.#measuredCount :
            DEFAULT_HEIGHT_ESTIMATE_PX;
      }

  /**
   * Removes all data related to |element| from the manager.
   *
   * @param {!Element} element The element to remove.
   */
  remove(element) {
    const oldSize = this.#sizes.get(element);
    if (oldSize === undefined) {
      return;
    }
    this.#totalMeasuredSize -= oldSize;
    this.#measuredCount--;
    this.#sizes.delete(element);
  }
}

/**
 * Manages the visibility (locked/unlocked state) of a list of
 * elements. This list of elements is assumed to be in vertical
 * display order (e.g. from lowest to highest offset).
 *
 * It uses intersection observers to ensure that changes that impact
 * visibility cause us to recalulate things (e.g. scrolling,
 * restyling).
 */
export class VisibilityManager {
  #sizeManager = new SizeManager();
  #container;
  #scroller;
  #elements;
  #revealedRange;
  #syncRAFToken;

  #intersectionObserver;

  #revealed = new Set();
  #observed = new Set();

  constructor(container) {
    this.#container = container;
    this.#scroller = container;
    while (this.#scroller != document.scrollingElement &&
           getComputedStyle(this.#scroller).overflow == 'visible') {
      this.#scroller = this.#scroller.parentElement;
    }
    this.#elements = container.children;

    // We want to sync if any element's size changes or if it becomes
    // more/less visible.
    this.#intersectionObserver = new IntersectionObserver(() => {
      this.scheduleSync();
    });
    this.#intersectionObserver.observe(container);

    for (const element of this.#elements) {
      this.#didAdd(element);
    }
    this.scheduleSync();
  }

  /**
   * Attempts to unlock a range of elements suitable for the current
   * viewport. This causes one forced layout.
   */
  #sync =
      () => {
        if (this.#elements.length === 0) {
          return;
        }

        // The basic idea is ...
        // The forced layout occurs at the start. We then use the laid out
        // coordinates (which are based on a mix of real sizes for
        // unlocked elements and the estimated sizes at the time of
        // locking for locked elements) to calculate a set of elements
        // which should be revealed. We use unlock/lock to move to this
        // new set of revealed elements. We will check in the next frame
        // whether we got it correct.

        // This causes a forced layout and takes measurements of all
        // currently revealed elements.
        this.#measureRevealed();

        // Compute the pixel bounds of what we would like to reveal. Then
        // find the elements corresponding to these bounds.
        // TODO(fergal): Use nearest scrolling ancestor?
        const desiredLow = 0 - window.innerHeight * BUFFER;
        const desiredHigh = window.innerHeight + window.innerHeight * BUFFER;
        const newBounds = this.#findElementBounds(desiredLow, desiredHigh);
        if (USE_FALLBACK)
          newBounds.expand(1);
        const newRevealed = newBounds.elementSet();

        // This should include all of the elements to be revealed and
        // also 1 element above and below those (if such elements
        // exist).
        const newObserved = new Set(newRevealed);
        if (!USE_FALLBACK && newRevealed.size !== 0) {
          const p = newBounds.first().previousElementSibling;
          if (p) {
            newObserved.add(p);
          }
          const n = newBounds.last().nextElementSibling;
          if (n) {
            newObserved.add(n);
          }
        }

        // Having revealed what we hope will fill the screen. It
        // could be incorrect. Rather than measuring now and correcting it
        // which would involve an unknown number of forced layouts, we
        // come back next frame and try to make it better. We know we can
        // stop when we didn't hide or reveal any elements.
        const previousAverage = this.#sizeManager.getAverageSize();
        const previousScroll = this.#scroller.scrollTop;
        if (this.#syncRevealed(newRevealed) + this.#syncObserved(newObserved) >
            0) {
          if (USE_FALLBACK) {
            // Since we're changing the size of items above the viewport we
            // need to adjust the scroll position to compensate.
            let scrollAdjustment = 0;
            const average = this.#sizeManager.getAverageSize();
            const hidden = this.#revealedRange;
            let topIndex = Math.floor(this.#scroller.scrollTop / average);
            if (hidden && hidden.size()) {
              topIndex = Math.min(topIndex, hidden.low);
              for (let i = hidden.low; i < newBounds.low; i++) {
                scrollAdjustment = scrollAdjustment - this.#sizeManager.getHopefulSize(this.#elements[i]) + previousAverage;
              }
            }
            for (let i = newBounds.low; i < topIndex; i++) {
              scrollAdjustment = scrollAdjustment + this.#sizeManager.getHopefulSize(this.#elements[i]) - previousAverage;
            }

            // Account for average size change
            scrollAdjustment += (average - previousAverage) * newBounds.low;

            // If we're not using render-subtree we need to adjust the padding
            // of the container to account for the items which are hidden.
            this.#container.style.paddingTop = (newBounds.low * average) + 'px';
            this.#container.style.paddingBottom = ((this.#elements.length - newBounds.high - 1) * average) + 'px';

            // Scroll anchoring may have already adjusted the scroll offset, so
            // scroll by the difference from the current scroll top.
            this.#scroller.scrollBy(0, previousScroll + scrollAdjustment - this.#scroller.scrollTop);
            this.#revealedRange = newBounds;
          }
          this.scheduleSync();
        }
      }

  /**
   * Calls hide and reveal on child elements to take us to the new state.
   *
   * Returns the number of elements impacted.
   */
  #syncRevealed =
      newRevealed => {
        return sets.applyToDiffs(
            this.#revealed, newRevealed, e => this.#hide(e),
            e => this.#reveal(e));
      }

  /**
   * Calls observe and unobserve on child elements to take us to the new state.
   *
   * Returns the number of elements impacted.
   */
  #syncObserved =
      newObserved => {
        return sets.applyToDiffs(
            this.#observed, newObserved, e => this.#unobserve(e),
            e => this.#observe(e));
      }

  /**
   * Searches within the managed elements and returns an ElementBounds
   * object. This object may represent an empty range or a range whose low
   * element contains or is lower than |low| (or the lowest element
   * possible). Similarly for |high|. If the bounds do not intersect with any
   * elements then an EMPTY_ELEMENT_BOUNDS is returned, otherwise, if the
   * |low| (|high|) is entirely outside the area of the managed elements
   * then the low (high) part of the ElementBounds will be snapped to the
   * lowest (highest) element.
   *
   * @param {!number} low The lower bound to locate.
   * @param {!number} high The upper bound to locate.
   */
  #findElementBounds =
      (low, high) => {
        const lastIndex = this.#elements.length - 1;
        const lowest = this.#getElementBounds(0).top;
        const highest =
            this.#getElementBounds(lastIndex).bottom;
        if (highest < low || lowest > high) {
          return EMPTY_ELEMENT_BOUNDS;
        }

        let lowElementIndex =
            findElement.findElementIndex(this.#elements, low, findElement.BIAS_LOW, this.#getElementBounds.bind(this));
        let highElementIndex = findElement.findElementIndex(
            this.#elements, high, findElement.BIAS_HIGH, this.#getElementBounds.bind(this));

        if (lowElementIndex === -1) {
          lowElementIndex = 0;
        }
        if (highElementIndex === -1) {
          highElementIndex = lastIndex;
        }
        return new ElementBounds(this.#elements, lowElementIndex, highElementIndex);
      }

  #getElementBounds =
      (index) => {
        if (!USE_FALLBACK || !this.#elements[index].classList.contains('hidden'))
          return this.#elements[index].getBoundingClientRect();
        // Otherwise, estimate bounding client rect.
        let average = this.#sizeManager.getAverageSize();
        let top = this.#container.getBoundingClientRect().top - this.#container.scrollTop;
        let bounds = { top: index * average + top, bottom: (index + 1) * average + top};
        if (this.#revealedRange && this.#revealedRange.size()) {
          let offset = 0;
          if (index < this.#revealedRange.low) {
            offset = this.#revealedRange.first().getBoundingClientRect().top - (this.#revealedRange.low - index) * average - bounds.top;
          } else if (index > this.#revealedRange.high) {
            offset = this.#revealedRange.last().getBoundingClientRect().bottom + (index - this.#revealedRange.high - 1) * average - bounds.top;
          }
          bounds.top += offset;
          bounds.bottom += offset;
        }
        return bounds;
      }

  /**
   * Updates the size manager with all of the currently revealed
   * elements' sizes. This will cause a forced layout.
   */
  #measureRevealed =
      () => {
        for (const element of this.#revealed) {
          this.#sizeManager.measure(element);
        }
      }

  /**
   * Unlocks |element| so that it can be rendered.
   *
   * @param {!Element} element The element to reveal.
   */
  #reveal =
      element => {
        this.#revealed.add(element);
        this.#unlock(element);
      }

  /**
   * Observes |element| so that it coming on-/off-screen causes a sync.
   *
   * @param {!Element} element The element to observe.
   */
  #observe =
      element => {
        this.#intersectionObserver.observe(element);
        this.#observed.add(element);
      }

  #logLockingError =
      (operation, reason, element) => {
        // TODO: Figure out the LAPIs error/warning logging story.
        console.error(  // eslint-disable-line no-console
            'Rejected: ', operation, element, reason);
      }

  /**
   * Unlocks |element|.
   *
   * @param {!Element} element The element to unlock.
   */
  #unlock =
      element => {
        if (USE_FALLBACK) {
          element.classList.remove('hidden');
        } else {
          element.removeAttribute('rendersubtree');
          element.style.intrinsicSize = '';
        }
      }

  /**
   * Locks |element| so that it cannot be rendered.
   *
   * @param {!Element} element The element to lock.
   */
  #hide =
      element => {
        this.#revealed.delete(element);
        if (USE_FALLBACK) {
          element.classList.add('hidden');
        } else {
          const size = this.#sizeManager.getHopefulSize(element);
          element.setAttribute('rendersubtree',
                               'invisible skip-viewport-activation');
          element.style.intrinsicSize = `${LOCKED_WIDTH_PX}px ${size}px`;
        }
      }

  /**
   * Unobserves |element| so that it coming on-/off-screen does not
   * cause a sync.
   *
   * @param {!Element} element The element to unobserve.
   */
  #unobserve =
      element => {
        this.#intersectionObserver.unobserve(element);
        this.#observed.delete(element);
      }

  /**
   * Notify the manager that |element| has been added to the list of
   * managed elements.
   *
   * @param {!Element} element The element that was added.
   */
  #didAdd =
      element => {
        // Added children should be invisible initially. We want to make them
        // invisible at this MutationObserver timing, so that there is no
        // frame where the browser is asked to render all of the children
        // (which could be a lot).
        this.#hide(element);
      }

  /**
   * Notify the manager that |element| has been removed from the list
   * of managed elements.
   *
   * @param {!Element} element The element that was removed.
   */
  #didRemove =
      element => {
        // Removed children should be made visible again. We should stop
        // observing them and discard any size info we have for them as it
        // may have become incorrect. We unlock unconditionally,
        // because it's simple and because it defends against
        // potential bugs in our own tracking of what is locked. Users
        // must not lock the children in the light tree, so there is
        // no concern about this having an impact on the users'
        // locking plans.
        this.#unlock(element);
        this.#revealed.delete(element);
        this.#unobserve(element);
        this.#sizeManager.remove(element);
      }

  /**
   * Ensures that @see #sync() will be called at the next animation frame.
   */
  scheduleSync() {
    if (this.#syncRAFToken !== undefined) {
      return;
    }

    this.#syncRAFToken = window.requestAnimationFrame(() => {
      this.#syncRAFToken = undefined;
      this.#sync();
    });
  }

  /**
   * Applys |records| generated by a mutation event to the manager.
   * This computes the elements that were newly added/removed and
   * notifies the managers for each.
   *
   * @param {!Object} records The mutations records.
   */
  applyMutationObserverRecords(records) {
    // It's unclear if we can support children which are not
    // elements. We cannot control their visibility using display
    // locking but we can just leave them alone.
    //
    // Relevant mutations are any additions or removals, including
    // non-elements and also elements that are removed and then
    // re-added as this may impact element bounds.
    let relevantMutation = false;
    const toRemove = new Set();
    for (const record of records) {
      relevantMutation = relevantMutation || record.removedNodes.length > 0;
      for (const node of record.removedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          toRemove.add(node);
        }
      }
    }

    const toAdd = new Set();
    for (const record of records) {
      relevantMutation = relevantMutation || record.addedNodes.length > 0;
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (toRemove.has(node)) {
            toRemove.delete(node);
          } else {
            toAdd.add(node);
          }
        }
      }
    }
    for (const node of toRemove) {
      this.#didRemove(node);
    }
    for (const node of toAdd) {
      this.#didAdd(node);
    }

    if (relevantMutation) {
      this.scheduleSync();
    }
  }
}
