const fetch = require("node-fetch");
const subreddits = require("./subreddits.json");
const fs = require("fs");
const utf8 = require("utf8");
const { table } = require("console");
// useless global vars
var paths;
var varstore;
var tableplace;
// useless functions
function isSafeCatName(str) {
  for (let c of str) {
    try {
      c.match(/[A-Za-z0-9]/);
      let thing = c.match(/[A-Za-z0-9]/);
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
  let p = path.split(".");
  for (let pp of p) {
    if (!isSafeCatName(pp)) return false;
  }
  return true;
}
function redo(str) {
  return str.slice(1, str.length - 1);
}
function randint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function choice(arr) {
  return arr[randint(0, arr.length - 1)];
}
function gjov(obj, t) {
  let paths = t.split(".");
  for (let path of paths) {
    obj = obj[path];
  }
  return obj;
}
function buildpath(t) {
  let paths = t.split(".");
  let res = ".";
  for (let path of paths) {
    res += path + ".";
  }
  return res.slice(0, res.length - 1);
}
function isArr(obj) {
  try {
    for (let thing of obj) {
      return true;
    }
  } catch {
    return false;
  }
}
function signPaths(obj, path = ".") {
  for (var key in obj) {
    if (obj[key] && typeof obj[key] == "object") {
      if (path !== "" && !paths.includes(path)) {
        if (path != ".") {
          paths.push(path);
        }
      }
      signPaths(obj[key], path + key + ".");
    }
  }
}
// beginning of code
class Trev {
  constructor(options) {
    try {
      this.verbose = options.verbose;
    } catch {
      this.verbose = true;
    }
    this.loadTrev();
  }
  loadTrev() {
    // or reload
    paths = [];
    varstore = [];
    tableplace = 0;
    this.subreddits = subreddits;
    signPaths(this.subreddits);
    for (let i = 0; i < paths.length; i++) {
      paths[i] = redo(paths[i]);
    }
    // memes category comming soon, you can already see it in subreddits.json but its empty for the moment
    if (this.verbose) console.log("[+] Loading/creating functions | trev");
    for (var path of paths) {
      let part = gjov(this.subreddits, path);
      for (let key of Object.keys(part)) {
        var curp = path + "." + key;
        if (isArr(gjov(this.subreddits, curp))) {
          if (!isSafePath(curp)) {
            throw new Error(
              "UnsafeCategoryName: One of the category names in the subreddits.json file was seen as unsafe.\nMake sure you use a trusted trevlist or the default one to avoid this error.\nRules for making a category name safe: only letters (caps or no caps) and numbers"
            );
          }
          varstore[tableplace] = gjov(this.subreddits, curp);
          eval(`
            this.subreddits${buildpath(curp)} = async () => {
              let subreddit = choice(varstore[${tableplace}]);
              let result = await this.getCustomSubreddit(subreddit);
            	return result;
            }
            `);
          tableplace++;
        }
      }
    }
    for (let key of Object.keys(this.subreddits)) {
      this[key] = this.subreddits[key];
    }
    this.subreddits = subreddits;
    if (this.verbose) console.log("[+] Fully loaded | trev");
  }
  changeTrevList(link) {
    if (link === "default")
      link =
        "https://gist.githubusercontent.com/rblxploit/28078547cd8b1a10bbf4d6a9f98f0a0e/raw/3fd6bee40b981369781f9073f6312b905d389412/Trev%2520default%2520subreddits";
    fetch(link)
      .then((r) => r.json())
      .then((trevlist) => {
        // save to file
        // recall the constructor
        // btw this is sync, not async
        // the reason why its not async is that i want it to be blocking
        fs.writeFileSync("subreddits.json", JSON.stringify(trevlist, null, 2));
        this.loadTrev();
      });
  }
  async getSubreddit(sr) {
    let link = `https://www.reddit.com${sr}/random.json`;
    let r;
    for (let i = 0; i < 1; i++) {
      try {
        r = await fetch(utf8.encode(link));
        return r.json();
      } catch (err) {
        i--;
      }
    }
  }
  formatRedditRes(r) {
    if (r === undefined) return undefined;
    let data = r[0].data.children[0].data;
    if (data.url_overridden_by_dest) {
      if (this.isImgurUpload(data.url_overridden_by_dest))
        data.url_overridden_by_dest = this.getRawImgur(
          data.url_overridden_by_dest
        );
    }
    let newdata = {
      title: data.title,
      author: data.author,
      subreddit: data.subreddit_name_prefixed,
      permalink: "https://www.reddit.com" + data.permalink,
      media: data.url_overridden_by_dest,
      over_18: data.over_18,
    };
    return newdata;
  }
  isImgurGallery(url) {
    return (
      url.startsWith("https://www.imgur.com/gallery/") ||
      url.startsWith("https://imgur.com/gallery/")
    );
  }
  isImgurMultiUpload(url) {
    return (
      url.startsWith("https://www.imgur.com/a/") ||
      url.startsWith("https://imgur.com/a/")
    );
  }
  isImgurUpload(url) {
    return (
      (url.startsWith("https://imgur.com/") ||
        url.startsWith("https://www.imgur.com/")) &&
      !this.isImgurGallery(url) &&
      !this.isImgurMultiUpload(url)
    );
  }
  getRawImgur(url) {
    if (!this.isImgurUpload(url)) return undefined;
    return "https://i." + url.slice("https://".length) + ".jpeg";
  }
  async getCustomSubreddit(subreddit) {
    if (!subreddit.startsWith("/r/")) {
      if (subreddit.startsWith("r/")) subreddit = "/" + subreddit;
      else subreddit = "/r/" + subreddit;
    }
    let r = await this.getSubreddit(subreddit);
    let tentatives = 0;
    while (r[0] === undefined && tentatives < 5) {
      let r = await getSubreddit(subreddit);
      tentatives++;
    }
    if (tentatives >= 5) {
      if (this.verbose) console.log("[-] Broken subreddit: " + subreddit);
      return undefined;
    }
    if (!r) return undefined;
    return this.formatRedditRes(r);
  }

  isGfyLink(url) {
    if (!url) return false;
    let urls = [
      "https://www.redgifs.com",
      "https://www.gfycat.com",
      "https://redgifs.com",
      "https://gfycat.com",
    ];
    for (let i = 0; i < urls.length; i++) {
      if (url.startsWith(urls[i])) return true;
    }
    return false;
  }
  gfyIframe(url) {
    let urls = [
      "https://www.redgifs.com",
      "https://www.gfycat.com",
      "https://redgifs.com",
      "https://gfycat.com",
    ];
    let urlstart;
    let name;
    for (let i = 0; i < urls.length; i++) {
      if (url.startsWith(urls[i])) {
        urlstart = urls[i];
        break;
      }
    }
    if (urlstart.includes("redgifs")) {
      // redgifs domain, +6 for /watch
      name = url.slice(urlstart.length + 6);
    } else {
      // gfycat domain, leave normal
      name = url.slice(urlstart.length);
    }
    return urlstart + "/ifr" + name;
  }
}

module.exports = new Trev();
