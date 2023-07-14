# Trev

Trev is a package for getting random nsfw and memes from reddit.

You can also get custom ones.

For support, join this discord server: [https://discord.gg/PrVRHPh](https://discord.gg/PrVRHPh)

## Usage example

<pre>
const trev = require("trev");

async function main() {
  let hentai = await trev.nsfw.hentai();
  console.log(
    `${hentai.title} | ${hentai.author}\nFrom: ${hentai.subreddit}\nMedia: ${hentai.media}\nisNsfw: ${hentai.over_18}`
  );
}

main();
</pre>

## Major change

Trev is now modular! More documentation on that later, i need to fix some issues first. Basically, it means that you can customize Trev however you can. Don't worry, there is also a way to revert those changes.

## Full list of functions

You can check the full list here: [https://hastebin.com/tohozitavu.cs](https://hastebin.com/tohozitavu.cs)
It is too long to how here, so i encourage checking it out.

## Other methods

<code>getCustomSubreddit(subreddit)</code><br>
This is for getting the images from a subreddit you are choosing. This will now add /r/ if you forgot to add it (or / if you did r/).

<code>isImgurUpload(url)</code><br>
Many memes are uploaded to imgur, but imgur links are not raw. This method is used to check if a link is an imgur upload. It will not get gallery uploads since those require web scraping to get the raw link of, which adds a ton of packages.

<code>getRawImgur(url)</code>
Gives you a raw imgur link from a normal imgur link. Super useful for memes. It checks if it's an imgur upload first (method above)

<code>isGfyLink(url)</code><br>
Many nsfw gifs/videos are from redgifs/gfycat, and those are not raw links unlike the others. So it would be useful to check if it's one of those links.

<code>gfyIframe(url)</code><br>
Converts a normal Gfy url into a Gfy embed. The point of this is that a Gfy embed page contains way less HTML than the normal page, which will save speed when doing web scraping.
