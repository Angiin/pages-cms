/**
 * Helper for images on GitHub: convert from a path to a raw.githubusercontent.com URL, handle prefixes, etc.
 */

import { reactive } from 'vue';
import github from '@/services/github';

// TTL for the cache (in milliseconds)
const ttl = 10000;

// We use the state object to coordinate data fetching (mainly to prevent fetching the same content multiple time) and cacching results.
const state = reactive({
  urls: {},
  paths: {},
  requests: {}
});

const getRelativeUrl = (owner, repo, branch, path) => {
  let relativePath = path;
  if (path.startsWith('https://raw.githubusercontent.com/')) {
    relativePath = path.replace(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`, '');
    relativePath = relativePath.split('?')[0];
  }
  
  return relativePath;
}

const getRawUrl = async (owner, repo, branch, path, isPrivate = false) => {
  if (isPrivate) {
    const fullPath = `${owner}/${repo}/${branch}/${path}`;
    if (!state.urls[fullPath]) {
      const parentPath = path.split('/').slice(0, -1).join('/');
      const fullParentPath = `${owner}/${repo}/${branch}/${parentPath}`;
      // The path should exist AND not have a value older than 1 minute (it's set to a timestamp when the request is made)
      if (state.paths[fullParentPath] && state.paths[fullParentPath] < Date.now() - ttl) delete state.paths[fullParentPath];
      if (state.paths[fullParentPath]) return null;
      if (!state.requests[fullParentPath]) {
        state.requests[fullParentPath] = github.getContents(owner, repo, branch, parentPath, false);
      }
      const files = await state.requests[fullParentPath];
      addRawUrls(owner, repo, branch, files);
      delete state.requests[fullParentPath];
      // We set this not to true but to the timestamp of the request, so that we can invalidate the cache after a certain time.
      state.paths[fullParentPath] = Date.now();
    }
    return state.urls[fullPath] || null;
  } else {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }
};

const addRawUrls = (owner, repo, branch, files) => {
  if (files) {
    files.forEach(file => {
      state.urls[`${owner}/${repo}/${branch}/${file.path}`] = file.download_url;
    });
  }
};

const relativeToRawUrls = async (owner, repo, branch, html, isPrivate = false) => {
  let newHtml = html;
  const matches = getImgSrcs(newHtml);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    if (!src.startsWith('/') && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:image/')) {  
      const rawUrl = await getRawUrl(owner, repo, branch, src, isPrivate);
      if (rawUrl) {
        newHtml = newHtml.replace(`src=${quote}${src}${quote}`, `src=${quote}${rawUrl}${quote}`);
      }
    }
  }
  
  return newHtml;
}

const rawToRelativeUrls = (owner, repo, branch, html) => {
  const matches = getImgSrcs(html);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    if (src.startsWith('https://raw.githubusercontent.com/')) {
      let relativePath = src.replace(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`, '');
      relativePath = relativePath.split('?')[0];
      html = html.replace(`src=${quote}${src}${quote}`, `src=${quote}${relativePath}${quote}`);
    }
  }

  return html;
}

const swapPrefix = (path, from, to) => {
  let newPath = path;
  if (path != undefined && from != undefined && to != undefined) {
    if (newPath.startsWith(from) && !(from == '/' && newPath.startsWith('//')) && !newPath.startsWith('http://') && !newPath.startsWith('https://') && !newPath.startsWith('data:image/')) {
      newPath = newPath.replace(from, to);
    }
  }

  return newPath;
}

const htmlSwapPrefix = (html, from, to) => {
  let newHtml = html;
  if (html != undefined && from != undefined && to != undefined) {
    const matches = getImgSrcs(newHtml);
    matches.forEach(match => {
      const src = match[1] || match[2];
      const quote = match[1] ? '"' : "'";
      if (src.startsWith(from) && !(from == '/' && src.startsWith('//')) && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:image/')) {
        const newSrc = src.replace(from, to);
        newHtml = newHtml.replace(`src=${quote}${src}${quote}`, `src=${quote}${newSrc}${quote}`);
      }
    });
  }

  return newHtml;
}

const removePrefix = (html, prefix) => {
  const matches = getImgSrcs(html);
  matches.forEach(match => {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    if (src.startsWith(prefix) && !(prefix == '/' && src.startsWith('//'))) {
      const srcWithoutPrefix = src.replace(prefix, '');
      html = html.replace(`src=${quote}${src}${quote}`, `src=${quote}${srcWithoutPrefix}${quote}`);
    }
  });

  return html;
}

const addPrefix = (html, prefix) => {
  const matches = getImgSrcs(html);
  matches.forEach(match => {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    if (!src.startsWith('/') && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:image/')) {
      html = html.replace(`src=${quote}${src}${quote}`, `src=${quote}${prefix}${src}${quote}`);
    }
  });
  
  return html;
}

const getImgSrcs = (html) => {
  const regex = /<img [^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/g;
  return [...html.matchAll(regex)];
}

export default { state, getRelativeUrl, getRawUrl, addRawUrls, relativeToRawUrls, rawToRelativeUrls, removePrefix, addPrefix, swapPrefix, htmlSwapPrefix };