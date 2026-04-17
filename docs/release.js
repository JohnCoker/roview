fetch('https://api.github.com/repos/johncoker/roview/releases')
  .then(res => res.json())
  .then(data => {
    const latest = data[0];
    const version = latest.name.replace(/^(?:Release *)?(?:v *)?(\d+\.(?:[\d.]*)).*$/, '$1');
    console.log('version', version);
    latest.assets.forEach(asset => {
      const url = asset.browser_download_url;
      console.log(url);
    });
  });
