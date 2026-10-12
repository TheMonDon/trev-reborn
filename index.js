/* eslint-disable no-control-regex */
const fetch = require('node-fetch');
const { URL } = require('url');
const Parser = require('rss-parser');
const { parseDocument, DomUtils } = require('htmlparser2');
const subreddits = require('./subreddits.json');
const fs = require('fs');
const utf8 = require('utf8');

const feedParser = new Parser();

let paths;
let varstore;
let tableplace;

function isSafeCatName(str) {
  for (const c of str) {
    try {
      c.match(/[A-Za-z0-9]/);
      const thing = c.match(/[A-Za-z0-9]/);
      if (!thing || thing === null) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function isSafePath(path) {
  const p = path.split('.');
  for (const pp of p) {
    if (!isSafeCatName(pp)) return false;
  }
  return true;
}

function redo(str) {
  return str.slice(1, str.length - 1);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function getValueByPath(obj, t) {
  const pathSegments = t.split('.');
  for (const path of pathSegments) {
    obj = obj[path];
  }
  return obj;
}

function generatePathString(path) {
  const pathSegments = path.split('.');
  let result = '.';
  for (const segment of pathSegments) {
    result += segment + '.';
  }
  return result.slice(0, result.length - 1);
}

function generateObjectPaths(obj, path = '.') {
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      if (path !== '' && !paths.includes(path)) {
        if (path !== '.') {
          paths.push(path);
        }
      }
      generateObjectPaths(obj[key], path + key + '.');
    }
  }
}

class Trev {
  constructor() {
    this.verbose = false;
    this.redditRateLimitUntil = 0;
    this.loadTrev();
  }

  loadTrev() {
    paths = [];
    varstore = [];
    tableplace = 0;
    this.subreddits = subreddits;
    generateObjectPaths(this.subreddits);
    for (let i = 0; i < paths.length; i++) {
      paths[i] = redo(paths[i]);
    }

    if (this.verbose) console.log('[+] Loading/creating functions | trev');
    for (const path of paths) {
      const part = getValueByPath(this.subreddits, path);
      for (const key of Object.keys(part)) {
        const curp = path + '.' + key;

        if (Array.isArray(getValueByPath(this.subreddits, curp))) {
          if (!isSafePath(curp)) {
            throw new Error(
              'UnsafeCategoryName: One of the category names in the subreddits.json file was seen as unsafe.\nMake sure you use a trusted trevlist or the default one to avoid this error.\nRules for making a category name safe: only letters (caps or no caps) and numbers',
            );
          }

          varstore[tableplace] = getValueByPath(this.subreddits, curp);
          eval(`
            this.subreddits${generatePathString(curp)} = async () => {
              let subreddit = choice(varstore[${tableplace}]);
              let result = await this.getCustomSubreddit(subreddit);
            	return result;
            }
            `);
          tableplace++;
        }
      }
    }
    for (const key of Object.keys(this.subreddits)) {
      this[key] = this.subreddits[key];
    }
    this.subreddits = subreddits;
    if (this.verbose) console.log('[+] Fully loaded | trev');
  }

  changeTrevList(link) {
    if (link === 'default')
      link =
        'https://gist.githubusercontent.com/TheMonDon/ff85efc32f06475d4483513f5ec7cfbc/raw/ec5bf4833f8115b1349cde2cea6304ef1c03240a/subreddits.json';
    fetch(link)
      .then((result) => result.json())
      .then((trevList) => {
        // save to file
        // recall the constructor
        // btw this is sync, not async
        // the reason why its not async is that i want it to be blocking
        fs.writeFileSync('subreddits.json', JSON.stringify(trevList, null, 2));
        this.loadTrev();
      });
  }

  async getSubreddit(subreddit) {
    if (Date.now() < this.redditRateLimitUntil) {
      if (this.verbose) console.log('[-] Reddit rate limit cooldown is active');
      return undefined;
    }

    const link = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new/.rss`;

    try {
      const response = await fetch(utf8.encode(link), {
        headers: {
          'User-Agent': process.env.TREV_USER_AGENT || 'node:trev-reborn:1.2.0 (public RSS client)',
        },
      });
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterSeconds = Number(retryAfter);
        const retryAfterDate = Date.parse(retryAfter);
        const cooldownMs =
          retryAfter && Number.isFinite(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : Math.max(0, retryAfterDate - Date.now()) || 60_000;
        this.redditRateLimitUntil = Date.now() + cooldownMs;
        throw new Error(
          `Reddit returned HTTP 429; retry after ${Math.ceil(cooldownMs / 1000)} seconds`,
        );
      }
      if (!response.ok) throw new Error(`Reddit returned HTTP ${response.status}`);

      const feed = await feedParser.parseString(await response.text());
      const children = [];

      for (const item of feed.items || []) {
        const document = parseDocument(item.content || '');
        const links = DomUtils.findAll(
          (node) => node.name === 'a' && DomUtils.getAttributeValue(node, 'href'),
          document.children,
        );
        const mediaUrl = links
          .map((node) => DomUtils.getAttributeValue(node, 'href'))
          .find((url) => {
            try {
              const parsedUrl = new URL(url);
              return (
                ['http:', 'https:'].includes(parsedUrl.protocol) &&
                !/(^|\.)reddit\.com$/i.test(parsedUrl.hostname)
              );
            } catch {
              return false;
            }
          });

        if (!mediaUrl) continue;

        let permalink;
        try {
          permalink = new URL(item.link).pathname;
        } catch {
          continue;
        }

        const author = item.creator || item.author || '';
        children.push({
          data: {
            title: item.title || '',
            author: typeof author === 'string' ? author.replace(/^\/?u\//, '') : '',
            subreddit_name_prefixed: `r/${subreddit}`,
            permalink,
            url_overridden_by_dest: mediaUrl,
            selftext: '',
          },
        });
      }

      return { data: { children } };
    } catch (err) {
      if (this.verbose) console.log('[-] Broken subreddit: ', err);
      return undefined;
    }
  }

  formatRedditRes(subredditData) {
    if (subredditData === undefined) return undefined;

    const data = subredditData[0].data.children[0].data;
    if (data.url_overridden_by_dest) {
      if (this.isImgurUpload(data.url_overridden_by_dest)) {
        data.url_overridden_by_dest = this.getRawImgur(data.url_overridden_by_dest);
      } else if (this.isRedGifsLink(data.url_overridden_by_dest)) {
        data.url_overridden_by_dest = this.redGifsIframe(data.url_overridden_by_dest);
      }
    }
    const media = this.getRawReddit(data);

    const newData = {
      title: data.title,
      author: data.author,
      subreddit: data.subreddit_name_prefixed,
      permalink: 'https://www.reddit.com' + data.permalink,
      media,
      text: data.selftext.replace(/([^\x00-\x7F]|&#[0-9]+;)/g, ''),
      over_18: data.over_18,
    };
    return newData;
  }

  isRedditGallery(url) {
    const regex = /^https?:\/\/(?:www\.)?reddit\.com\/gallery\//;
    return regex.test(url);
  }

  getRawReddit(data) {
    let url = data.url_overridden_by_dest;
    if (url) {
      if (this.isRedditGallery(url)) {
        url = Object.values(data.media_metadata)[0].s.u;
      }
      url = url.replace(/preview/, 'i').replace(/\?.+$/, '');
    }
    return url;
  }

  isImgurGallery(url) {
    const regex = /^https?:\/\/(?:www\.)?imgur\.com\/gallery\//;
    return regex.test(url);
  }

  isImgurMultiUpload(url) {
    const regex = /^https?:\/\/(?:www\.)?imgur\.com\/a\//;
    return regex.test(url);
  }

  isImgurUpload(url) {
    return (
      (url.startsWith('https://imgur.com/') || url.startsWith('https://www.imgur.com/')) &&
      !this.isImgurGallery(url) &&
      !this.isImgurMultiUpload(url)
    );
  }

  getRawImgur(url) {
    if (!this.isImgurUpload(url)) return undefined;
    return 'https://i.' + url.slice('https://'.length) + '.jpeg';
  }

  async getCustomSubreddit(subreddit) {
    subreddit = subreddit.replace(/^(\/)?(r\/)?/i, '');

    let subredditData = await this.getSubreddit(subreddit);
    let attempts = 0;

    // Retry fetching if no valid data is returned
    while (
      (!subredditData || !subredditData.data || !subredditData.data.children.length) &&
      attempts < 5
    ) {
      if (Date.now() < this.redditRateLimitUntil) return undefined;
      subredditData = await this.getSubreddit(subreddit);
      attempts++;
    }

    if (attempts >= 5) {
      if (this.verbose) console.log('[-] Broken subreddit: ' + subreddit);
      return undefined;
    }

    // Select a random post from the fetched posts
    const posts = subredditData.data.children;
    const randomIndex = Math.floor(Math.random() * posts.length);
    const randomPost = posts[randomIndex]?.data;

    return randomPost
      ? this.formatRedditRes([{ data: { children: [{ data: randomPost }] } }])
      : undefined;
  }

  isRedGifsLink(url) {
    if (!url) return false;
    const urls = [
      'https://www.redgifs.com',
      'https://www.gfycat.com',
      'https://redgifs.com',
      'https://gfycat.com',
      'http://v3.redgifs.com',
    ];
    for (let i = 0; i < urls.length; i++) {
      if (url.startsWith(urls[i])) return true;
    }
    return false;
  }

  redGifsIframe(url) {
    const urls = [
      'https://www.redgifs.com',
      'https://www.gfycat.com',
      'https://redgifs.com',
      'https://gfycat.com',
      'http://v3.redgifs.com',
    ];
    let urlStart;
    let name;
    for (let i = 0; i < urls.length; i++) {
      if (url.startsWith(urls[i])) {
        urlStart = urls[i];
        break;
      }
    }
    if (urlStart.includes('redgifs')) {
      // redgifs domain, +6 for /watch
      name = url.slice(urlStart.length + 6);
    } else {
      // gfycat domain, leave normal
      name = url.slice(urlStart.length);
    }
    return urlStart + '/ifr' + name;
  }
}

module.exports = new Trev();
