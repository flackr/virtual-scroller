import '../library/index.js';

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
  'Did you know that long flowing text can be hard to deal with in a scroller which can change sizes? This is because text wrapping is not trivial and any time the container size changes the text may wrap to any number of lines as a result. This represents non-trivial complexity when performing layout on long flowing feeds. When you have a lot of posts with long text like this it can be expensive to do a full layout. By using the render-subtree property we avoid doing the expensive layout work for this offscreen content.',
  'A typical short post.',
  'This is a medium-length post containing some special formatting such as a <a href="https://en.wikipedia.org/wiki/Hashtag">#link</a>',
];

const PICTURES = [
  '<img src="images/pics/coffee.jpg" width="500px" height="500px">',
  '<img src="images/pics/gorge.jpg" width="500px" height="281px">',
  '<img src="images/pics/night.jpg" width="500px" height="375px">',
  '<video src="images/pics/cat.webm" width="360px" height="640px" onclick="this.play();">',
];

document.addEventListener('DOMContentLoaded', init);

function random(list) {
 return list[Math.floor(Math.random() * list.length)];
}

function parseHash() {
  let result = {};
  let params = location.hash.substring(1).split('&');
  for (let i = 0; i < params.length; i++) {
    let values = params[i].split('=');
    if (values.length == 2)
      result[decodeURIComponent(values[0])] = decodeURIComponent(values[1]);
  }
  return result;
}

const params = parseHash();
const NODES = params.nodes || 10000;

function init() {
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
