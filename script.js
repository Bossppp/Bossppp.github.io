function showPage(page) {
    document.getElementById("home").classList.add("hidden");
    document.getElementById("about").classList.add("hidden");
    document.getElementById("projects").classList.add("hidden");
    document.getElementById(page).classList.remove("hidden");
}