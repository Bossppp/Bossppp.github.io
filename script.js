function showPage(page) {
    const pages = document.querySelectorAll(".content");

    pages.forEach((p) => {
        if (p.id === page) {
            p.classList.add("show");
            p.classList.remove("hidden");
        } else {
            p.classList.remove("show");
            p.classList.add("hidden");
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    showPage("home");
});
