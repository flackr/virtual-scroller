/**
 * Copyright 2019 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 *
 * @fileoverview This file defines virtual-scroller element.
 * EXPLAINER: https://github.com/WICG/virtual-scroller/blob/master/README.md
 * @package
 */
import {VisibilityManager} from './visibility-manager.js';

function styleSheetFactory() {
  let styleSheet;
  return () => {
    if (!styleSheet) {
      styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(`
:host {
  display: block;
}

::slotted(*) {
  display: block !important;
  contain: layout paint style !important;
}
::slotted(.hidden) {
  display: none !important;
}
@supports (subtree-visibility: hidden) {
  ::slotted(.hidden) {
    display: block !important;
    subtree-visibility: hidden;
  }
}
`);
    }
    return styleSheet;
  };
}

const generateStyleSheet = styleSheetFactory();

/**
 * The class backing the virtual-scroller custom element.
 */
export class VirtualScrollerElement extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({mode: 'closed'});
    shadowRoot.adoptedStyleSheets = [generateStyleSheet()];
    shadowRoot.appendChild(document.createElement('slot'));

    const visibilityManager = new VisibilityManager(this);

    new MutationObserver(records => {
      visibilityManager.applyMutationObserverRecords(records);
    }).observe(this, {childList: true});
  }
}

customElements.define('virtual-scroller', VirtualScrollerElement);
