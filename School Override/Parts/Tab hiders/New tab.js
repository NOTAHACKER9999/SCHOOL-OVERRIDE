// Change tab to Chrome New Tab
document.title = "New Tab";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://www.google.com/favicon.ico"; // Chrome's default favicon
