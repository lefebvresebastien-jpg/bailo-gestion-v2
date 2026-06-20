exports.handler = async function(event) {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400'
    },
    body: JSON.stringify({
      publicKey: process.env.VAPID_PUBLIC_KEY || null
    })
  };
};
