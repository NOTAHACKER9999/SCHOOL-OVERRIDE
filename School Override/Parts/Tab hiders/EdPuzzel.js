// Change tab to Edpuzzle
document.title = "Edpuzzle";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://edpuzzle.com/favicon.ico";
