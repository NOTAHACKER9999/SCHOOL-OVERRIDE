// Change tab to Moodle
document.title = "Moodle";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://moodle.org/favicon.ico";
