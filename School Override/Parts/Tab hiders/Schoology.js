// Change tab to Schoology
document.title = "Schoology";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://www.schoology.com/favicon.ico";
