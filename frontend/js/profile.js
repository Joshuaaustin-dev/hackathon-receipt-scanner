// Fetch profile and populate the DOM
async function loadAndRenderProfile() {
  try {
    const res = await fetch("/api/profile");
    if (!res.ok) {
      console.warn("Profile fetch failed", res.status);
      document.getElementById("profile-name").textContent = "Unable to load";
      return;
    }

    const data = await res.json();
    const src = data?.profile || data;
    console.log(src);
    const name = src?.name || "";
    const bio = src?.bio || "";
    const allergies = Array.isArray(src?.preferences.allergies)
      ? src.preferences.allergies
      : [];

    document.getElementById("profile-name").textContent = name || "No name set";
    document.getElementById("profile-bio").textContent = bio || "No name set";

    const allergiesEl = document.getElementById("profile-allergies");
    if (allergies.length === 0) {
      allergiesEl.innerHTML = '<p class="muted">None listed</p>';
    } else {
      allergiesEl.innerHTML = `<ul>${allergies.map((a) => `<li>${a}</li>`).join("")}</ul>`;
    }
  } catch (err) {
    console.error("Error loading profile in profile.js", err);
    document.getElementById("profile-name").textContent =
      "Error loading profile";
  }
}

window.addEventListener("DOMContentLoaded", loadAndRenderProfile);
