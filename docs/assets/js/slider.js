let slider = document.getElementById("slider");
let dotsContainer = document.getElementById("dots");

let slides = slider.querySelectorAll(".slide");
let index = 0;

// Create control dots
slides.forEach((_, i) => {
    let dot = document.createElement("span");
    if (i === 0) dot.classList.add("active");
    dot.addEventListener("click", () => goTo(i));
    dotsContainer.appendChild(dot);
});

function goTo(i) {
    index = i;
    slider.style.transform = `translateX(-${i * 280}px)`;

    let dots = dotsContainer.querySelectorAll("span");
    dots.forEach(d => d.classList.remove("active"));
    dots[i].classList.add("active");
}

// Auto slide
setInterval(() => {
    index = (index + 1) % slides.length;
    goTo(index);
}, 3000);
