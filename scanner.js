// Injected into an instagram.com tab with chrome.scripting.executeScript.
// It runs there so the request carries the user's own session cookies.
// Must stay self-contained: Chrome serializes the function, so it cannot use
// anything from the surrounding module.
export async function igFetch(url, csrf) {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'X-IG-App-ID': '936619743392459',
        'X-CSRFToken': csrf,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML login page, etc. */ }
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: null, error: String(e) };
  }
}
