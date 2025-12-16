/* ==========================================================
   SAFE UI ANIMATION ENGINE (no canvas, no charts, no errors)
   ========================================================== */

console.log("UI Animation Loaded");

// ---------------------- PARALLAX BACKGROUND ------------------------
document.addEventListener("mousemove", (e) => {
  const x = (window.innerWidth / 2 - e.clientX) / 50;
  const y = (window.innerHeight / 2 - e.clientY) / 50;

  document.querySelectorAll(".layer").forEach((layer, i) => {
    const depth = (i + 1) * 6;
    layer.style.transform = `translate(${x / depth}px, ${y / depth}px)`;
  });
});

// ---------------------- FLOATING PANELS ----------------------------
document.querySelectorAll(".floating").forEach((panel) => {
  panel.addEventListener("mouseenter", () => {
    panel.style.transform = "translateY(-10px)";
  });

  panel.addEventListener("mouseleave", () => {
    panel.style.transform = "translateY(0px)";
  });
});

// ---------------------- FADE-IN SECTIONS ---------------------------
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.18 }
);

document.querySelectorAll(".fade-section").forEach((el) => observer.observe(el));

// ---------------------- MAGNETIC BUTTON EFFECT ---------------------
document.querySelectorAll(".magic-btn").forEach((btn) => {
  btn.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    btn.style.transform = `translate(${x * 0.07}px, ${y * 0.07}px)`;
  });

  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "translate(0px,0px)";
  });
});

// ---------------------- AVATAR EYE TRACKING ------------------------
document.addEventListener("mousemove", (e) => {
  const eyes = document.querySelectorAll(".eye");
  eyes.forEach((eye) => {
    const rect = eye.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const rad = Math.atan2(e.clientY - cy, e.clientX - cx);
    const rot = rad * (180 / Math.PI);

    eye.style.transform = `rotate(${rot}deg)`;
  });
});
