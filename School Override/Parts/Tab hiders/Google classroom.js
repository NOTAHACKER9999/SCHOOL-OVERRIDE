// Change tab to Google Classroom
document.title = "Google Classroom";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://ssl.gstatic.com/classroom/favicon.ico";
