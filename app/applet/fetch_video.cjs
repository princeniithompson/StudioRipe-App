const https = require('https');
https.get('https://streamable.com/1k022z', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const match = data.match(/https:\/\/\w+\.streamable\.com\/video\/mp4\/[a-zA-Z0-9_-]+\.mp4\?Expires=[0-9]+&Signature=[a-zA-Z0-9_-]+&Key-Pair-Id=[a-zA-Z0-9_-]+/);
    if(match) {
       console.log("MATCH:", match[0]);
    } else {
       const sourceMatch = data.match(/<meta property="og:video:url" content="([^"]+)"/);
       if(sourceMatch) console.log("OG URL:", sourceMatch[1]);
       else console.log("Not found snippet:", data.substring(0, 1000));
    }
  });
});
