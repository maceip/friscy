const res = await fetch("http://www.aol.com");
console.log("Status:", res.status);
console.log("Headers:", Object.fromEntries(res.headers.entries()));
const text = await res.text();
console.log("Body length:", text.length);
console.log("First 200 chars:", text.substring(0, 200));
