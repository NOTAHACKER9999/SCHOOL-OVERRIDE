// Change tab to PowerSchool
document.title = "PowerSchool";

let link = document.querySelector("link[rel~='icon']");
if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
}
link.href = "https://www.powerschool.com/favicon.ico";
