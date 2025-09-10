// Change tab to Edmodo
document.title = "Edmodo";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://www.edmodo.com/favicon.ico";
