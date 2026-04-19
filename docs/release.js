// find latest release, update version number, and point download links to build artifacts
fetch('https://api.github.com/repos/johncoker/roview/releases')
  .then(res => res.json())
  .then(data => {
    const latest = data[0];
    const links = Array.from(document.getElementsByTagName('a'))
                       .filter(a => a.href == 'https://github.com/johncoker/roview/releases');

    const version = latest.name.replace(/^(?:Release *)?(?:v *)?(\d+\.(?:[\d.]*)).*$/, '$1');
    let link = links.find(a => a.text == 'latest');
    if (link) link.text = 'version ' + version;

    latest.assets.forEach(asset => {
      const url = asset.browser_download_url;
      let prefix;
      if (/\.(exe|msi)$/.test(url)) {
        prefix = 'Windows';
      } else if (/\.dmg$/.test(url)) {
        prefix = 'macOS';
      } else if (/\.AppImage$/.test(url)) {
        prefix = 'Linux';
      }
      if (prefix) {
        link = links.find(a => a.text.startsWith(prefix));
        if (link) {
          link.href = url;
          link.title = url.replace(/^.*\//, '');
        }
      }
    });
  });
