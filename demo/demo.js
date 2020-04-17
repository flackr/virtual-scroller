const CHARACTERS = [
  {'name': 'Tom', 'avatar': 'images/avatars/cat1.jpg'},
  {'name': 'Harry', 'avatar': 'images/avatars/cat2.jpg'},
  {'name': 'Snowball', 'avatar': 'images/avatars/cat3.jpg'},
  {'name': 'Belle', 'avatar': 'images/avatars/cat4.jpg'},
  {'name': 'Grumpy', 'avatar': 'images/avatars/cat5.jpg'},
  {'name': 'Skitty', 'avatar': 'images/avatars/cat6.jpg'},
  {'name': 'El Dog', 'avatar': 'images/avatars/dog1.jpg'},
  {'name': 'Blubs', 'avatar': 'images/avatars/fish1.jpg'},
  {'name': 'Quack', 'avatar': 'images/avatars/goose.jpg'},
  {'name': 'Whinney', 'avatar': 'images/avatars/horse.jpg'},
  {'name': 'Tux', 'avatar': 'images/avatars/penguin.jpg'},
  {'name': 'Jerry', 'avatar': 'images/avatars/rat.jpg'},
  {'name': 'Chompy', 'avatar': 'images/avatars/shark.jpg'},
];

const MESSAGES = [
  'Did you know that long flowing text can be hard to deal with in a scroller which can change sizes? This is because text wrapping is not trivial and any time the container size changes the text may wrap to any number of lines as a result. This represents non-trivial complexity when performing layout on long flowing feeds. When you have a lot of posts with long text like this it can be expensive to do a full layout. By using the subtree-visibility property we avoid doing the expensive layout work for this offscreen content.',
  'A typical short post.',
  'This is a medium-length post containing some special formatting such as a <a href="https://en.wikipedia.org/wiki/Hashtag">#link</a>',
];

const PICTURES = [
  '<img src="images/pics/coffee.jpg" width="500px" height="500px">',
  '<img src="images/pics/gorge.jpg" width="500px" height="281px">',
  '<img src="images/pics/night.jpg" width="500px" height="375px">',
  '<video src="images/pics/cat.webm" width="360px" height="640px" onclick="this.play(); arguments[0].stopPropagation();">',
];

document.addEventListener('DOMContentLoaded', init);

function random(list) {
 return list[Math.floor(Math.random() * list.length)];
}

function parseHash() {
  let result = {};
  let params = location.search.substring(1).split('&');
  for (let i = 0; i < params.length; i++) {
    let values = params[i].split('=');
    if (values.length == 2)
      result[decodeURIComponent(values[0])] = decodeURIComponent(values[1]);
  }
  return result;
}

const params = parseHash();
const NODES = params.nodes || 1000;
const USE_FALLBACK = !getComputedStyle(document.body).intrinsicSize;
let addAmt = 1;
let savedScroll;

function hide(node) {
  if (USE_FALLBACK) {
    node.style.display = 'none';
  } else {
    node.style.intrinsicSize = '0px 0px';
    node.setAttribute('rendersubtree', 'invisible');
  }
}

function show(node) {
  if (USE_FALLBACK) {
    node.style.display = '';
  } else {
    node.style.intrinsicSize = '';
    node.removeAttribute('rendersubtree');
  }
}

function getScroller(node) {
  while (node && node != document.scrollingElement && getComputedStyle(node).overflow == 'visible')
    node = node.parentElement;
  return node;
}

function showDetails(node) {
  requestAnimationFrame((ts1) => {
    let scroller = document.querySelector('.stream');
    let details = document.getElementById('details-view');
    details.classList.add('visible');
    let scrollingElement = getScroller(scroller);
    savedScroll = scrollingElement.scrollTop;
    hide(scroller);
    scrollingElement.scrollTop = 0;
    details.querySelector('.content').innerHTML = node.innerHTML;
    requestAnimationFrame((ts2) => {
      let log = document.querySelector('#log');
      if (log)
        log.textContent = 'Switched in ' + Math.round(ts2 - ts1) + 'ms';
    });
  });
}

function hideDetails() {
  requestAnimationFrame((ts1) => {
    let scroller = document.querySelector('.stream');
    let details = document.getElementById('details-view');
    show(scroller);
    getScroller(scroller).scrollTop = savedScroll;
    details.classList.remove('visible');
    requestAnimationFrame((ts2) => {
      let log = document.querySelector('#log');
      if (log)
        log.textContent = 'Switched in ' + Math.round(ts2 - ts1) + 'ms';
    });
  });
}

function init() {
  document.querySelector('#back').addEventListener('click', hideDetails);
  // Create virtual scroller items.
  let scroller = document.querySelector('.stream');
  for (let i = 0; i < NODES; i++) {
    let character = random(CHARACTERS);
    let node = document.querySelector('#templates > .post').cloneNode(true);
    node.querySelector('.avatar').style.backgroundImage = 'url(' + character.avatar + ')';
    node.querySelector('.name').textContent = character.name;
    node.querySelector('.message').innerHTML = random(MESSAGES);
    node.querySelector('.media').innerHTML = random(PICTURES);
    scroller.appendChild(node);
    node.addEventListener('click', function(evt) {
      showDetails(node);
      evt.stopPropagation();
    });
  }

  if (params.test) {
    let panel = document.createElement('div');
    panel.classList.add('panel');
    let info = document.createElement('p');
    info.setAttribute('id', 'log');
    info.textContent = NODES + ' nodes';
    panel.appendChild(info);
    let commentBtn = document.createElement('button');
    commentBtn.textContent = 'Add comments';
    commentBtn.onclick = function() {
      if (addAmt < 1000)
        addAmt *= 10;
      requestAnimationFrame((ts1) => {
        for (let i = 0; i < addAmt; i++) {
          let character = random(CHARACTERS);
          let node = document.querySelector('#templates > .comment').cloneNode(true);
          node.querySelector('.avatar').style.backgroundImage = 'url(' + character.avatar + ')';
          node.querySelector('.name').textContent = character.name;
          node.querySelector('.message').innerHTML = random(MESSAGES);
          random(scroller.children).querySelector('.comments').appendChild(node);
        }
        requestAnimationFrame((ts2) => {
          info.textContent = addAmt + ' comments (' + Math.round(ts2 - ts1) + 'ms)';
        });
      });
    };
    panel.appendChild(commentBtn);
    let scrollBtn = document.createElement('button');
    scrollBtn.textContent = 'Test scroll';
    scrollBtn.onclick = function() {
      let scrollElem = document.scrollingElement;
      let target = 0;
      if (scrollElem.scrollTop < scrollElem.scrollHeight / 2)
        target = scrollElem.scrollHeight;
      scrollElem.scrollTo({
        top: target,
        left: 0,
        behavior: 'smooth',
      });
      requestAnimationFrame((firstTime) => {
        let stillAmt = 0;
        let lastPos = scrollElem.scrollTop;
        let lastTime = firstTime;
        let frames = 0;
        let measure = function(ts) {
          ++frames;
          lastTime = ts;
          if (lastPos == scrollElem.scrollTop)
            stillAmt++;
          else
            stillAmt = 0;
          lastPos = scrollElem.scrollTop;
          if (stillAmt < 3) {
            requestAnimationFrame(measure);
          } else {
            info.textContent = frames + ' frames (' + Math.round(frames / ((ts - firstTime) / 1000))+ ' fps)';
          }
        };
        requestAnimationFrame(measure);
      });
    };
    panel.appendChild(scrollBtn);
    let resizeBtn = document.createElement('button');
    resizeBtn.textContent = 'Resize';
    resizeBtn.onclick = function() {
      requestAnimationFrame((ts1) => {
        scroller.classList.toggle('wide');
        requestAnimationFrame((ts2) => {
          info.textContent = Math.round(ts2 - ts1) + 'ms resize';
        });
      });
    };
    panel.appendChild(resizeBtn);
    document.body.appendChild(panel);
  }
  // uncomment to test scrolling.
  // test();
}

function scrollChange() {
  return new Promise((fn) => {
    window.addEventListener('scroll', function handler() {
      window.removeEventListener('scroll', handler);
      fn();
    });
  });
}

async function scrollToBottom() {
  let elem = document.scrollingElement;
  window.scrollTo({
    top: elem.scrollHeight,
    left: 0,
    behavior: 'smooth',
  });
  while (elem.scrollTop < elem.scrollHeight - elem.clientHeight) {
    await scrollChange();
  }
}

async function scrollToTop() {
  let elem = document.scrollingElement;
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth',
  });
  while (elem.scrollTop > 0) {
    await scrollChange();
  }
}

async function test() {
  while(true) {
    await scrollToBottom();
    await scrollToTop();
  }
}
