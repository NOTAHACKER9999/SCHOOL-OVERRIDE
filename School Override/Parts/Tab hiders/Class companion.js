// Change tab to Class Companion
document.title = "Class Companion";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://classcompanion.com/favicon.ico"; // Replace if incorrect
