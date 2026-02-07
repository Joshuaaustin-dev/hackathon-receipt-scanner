// Backend API URL
const API_URL = "http://localhost:3001";

// Saved recipes from localStorage
function getSavedRecipes() {
  const saved = localStorage.getItem("savedRecipes");
  return saved ? JSON.parse(saved) : [];
}

function isSavedRecipe(recipeName) {
  return getSavedRecipes().includes(recipeName);
}

function saveRecipe(recipeName) {
  const saved = getSavedRecipes();
  if (!saved.includes(recipeName)) {
    saved.push(recipeName);
    localStorage.setItem("savedRecipes", JSON.stringify(saved));
  }
}

function removeSavedRecipe(recipeName) {
  let saved = getSavedRecipes();
  saved = saved.filter((name) => name !== recipeName);
  localStorage.setItem("savedRecipes", JSON.stringify(saved));
}

// Modal functionality
function openRecipeModal(recipe) {
  const modal = document.getElementById("recipeModal");
  const isSaved = isSavedRecipe(recipe.name);

  // Populate header
  document.getElementById("modalTitle").textContent = recipe.name;

  // Populate description
  document.getElementById("modalDescription").textContent =
    recipe.description || "No description available";

  // Populate allergen warning
  const allergenWarning = document.getElementById("modalAlergenWarning");
  if (recipe.allergenWarning && recipe.allergenWarning !== "None") {
    allergenWarning.textContent = recipe.allergenWarning;
    allergenWarning.classList.remove("hidden");
  } else {
    allergenWarning.classList.add("hidden");
  }

  // Populate ingredients
  const ingredientsList = document.getElementById("modalIngredientsList");
  ingredientsList.innerHTML = recipe.ingredients
    .map((ing) => `<li>${ing}</li>`)
    .join("");

  // Populate instructions
  const instructionsList = document.getElementById("modalInstructionsList");
  instructionsList.innerHTML = recipe.instructions
    .map((step) => `<li>${step}</li>`)
    .join("");

  // Populate tags
  const tagsSection = document.getElementById("modalTags");
  if (recipe.dietaryTags && recipe.dietaryTags.length > 0) {
    tagsSection.innerHTML = `
      <h3 class="modal-section-title">Dietary Info</h3>
      <div>${recipe.dietaryTags.map((tag) => `<span class="tag">${tag}</span>`).join(" ")}</div>
    `;
  } else {
    tagsSection.innerHTML = "";
  }

  // Update save button
  const saveBtn = document.getElementById("modalSaveBtn");
  if (isSaved) {
    saveBtn.classList.add("saved");
    saveBtn.textContent = "✓ Recipe Saved";
  } else {
    saveBtn.classList.remove("saved");
    saveBtn.textContent = "💾 Save Recipe";
  }

  // Store current recipe for save action
  saveBtn.setAttribute("data-recipe-name", recipe.name);

  // Show modal
  modal.classList.add("active");
}

function closeRecipeModal() {
  const modal = document.getElementById("recipeModal");
  modal.classList.remove("active");
}

// Modal event listeners
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("recipeModal");
  const closeBtn = document.querySelector(".modal-close");
  const closeBtnFooter = document.querySelector(".btn-modal-close");
  const saveBtn = document.getElementById("modalSaveBtn");

  closeBtn?.addEventListener("click", closeRecipeModal);
  closeBtnFooter?.addEventListener("click", closeRecipeModal);

  // Close modal when clicking backdrop
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeRecipeModal();
    }
  });

  // Save recipe button
  saveBtn?.addEventListener("click", () => {
    const recipeName = saveBtn.getAttribute("data-recipe-name");
    if (isSavedRecipe(recipeName)) {
      removeSavedRecipe(recipeName);
      saveBtn.classList.remove("saved");
      saveBtn.textContent = "💾 Save Recipe";
    } else {
      saveRecipe(recipeName);
      saveBtn.classList.add("saved");
      saveBtn.textContent = "✓ Recipe Saved";
    }
  });

  // Close modal with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRecipeModal();
    }
  });
});

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

    const name = src?.name || "";
    const bio = src?.bio || "";

    // FIXED: Access nested allergies properly
    const allergies = Array.isArray(src?.preferences?.allergies)
      ? src.preferences.allergies
      : [];

    document.getElementById("profile-name").textContent = name || "No name set";
    document.getElementById("profile-bio").textContent = bio || "No bio set";

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

// Recipe Generation functionality
document
  .getElementById("generateBtn")
  ?.addEventListener("click", generateRecipes);

async function generateRecipes() {
  const generateBtn = document.getElementById("generateBtn");
  const loadingMessage = document.getElementById("loadingContainer");
  const recipesContainer = document.getElementById("recipesContainer");

  // Get test ingredients from textarea
  const testIngredientsText = document.getElementById("testIngredients").value;
  const ingredients = parseTestIngredients(testIngredientsText);

  // Disable button and show loading
  generateBtn.disabled = true;
  loadingMessage.classList.remove("hidden");
  recipesContainer.innerHTML = "";

  try {
    // FIXED: Template literal syntax
    const response = await fetch(`${API_URL}/api/generate-recipes`, {
      // Fixed: was fetch`...`
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ingredients }),
    });

    const data = await response.json();

    if (data.success) {
      displayRecipes(data.recipes, data.userProfile);
    } else {
      recipesContainer.innerHTML = `<div class="message error">${data.error}</div>`;
    }
  } catch (error) {
    console.error("Error generating recipes:", error);
    recipesContainer.innerHTML = `<div class="message error">Error: ${error.message}</div>`;
  } finally {
    generateBtn.disabled = false;
    loadingMessage.classList.add("hidden");
  }
}

// Parse test ingredients from textarea
function parseTestIngredients(text) {
  if (!text.trim()) return [];

  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split("-");
      return {
        name: parts[0].trim(),
        quantity: parts[1] ? parts[1].trim() : "",
      };
    });
}

// Display recipes on the page with full details
function displayRecipes(recipes, userProfile) {
  const container = document.getElementById("recipesContainer");
  if (!recipes || recipes.length === 0) {
    container.innerHTML =
      '<div class="message error">No recipes generated</div>';
    return;
  }

  // Access allergies and dietary preferences from nested preferences object
  const preferences = userProfile.preferences || {};
  const allergies = Array.isArray(preferences.allergies)
    ? preferences.allergies
    : [];
  const dietaryPreferences = Array.isArray(preferences.dietaryPreferences)
    ? preferences.dietaryPreferences
    : [];

  let html = "";
  recipes.forEach((recipe, index) => {
    const safetyClass = recipe.isSafe === false ? "unsafe" : "";
    const difficultyClass = `difficulty-${recipe.difficulty}`;
    const isSaved = isSavedRecipe(recipe.name);
    const saveIcon = isSaved ? "❤️" : "🤍";

    html += `
      <article class="recipe-card ${safetyClass}">
        <!-- Recipe Header -->
        <div class="recipe-header">
          <h3>
            <span class="recipe-number">${index + 1}</span>
            ${recipe.name}
          </h3>
          <p class="description">${recipe.description || ""}</p>
          
          <!-- Recipe Meta Info -->
          <div class="recipe-meta">
            <span class="meta-item">⏱️ Prep: ${recipe.prepTime || "N/A"}</span>
            <span class="meta-item">🔥 Cook: ${recipe.cookTime || "N/A"}</span>
            <span class="meta-item">🍽️ Servings: ${recipe.servings || "N/A"}</span>
            <span class="meta-item ${difficultyClass}">📊 ${recipe.difficulty || "medium"}</span>
          </div>

          <!-- Dietary Tags -->
          ${
            recipe.dietaryTags && recipe.dietaryTags.length > 0
              ? `
            <div class="tags">
              ${recipe.dietaryTags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
            </div>
          `
              : ""
          }
        </div>

        <!-- Allergen Warning -->
        ${
          recipe.allergenWarning && recipe.allergenWarning !== "None"
            ? `
          <div class="allergen-warning">
            ${recipe.allergenWarning}
          </div>
        `
            : ""
        }

        <!-- Recipe Content -->
        <div class="recipe-content">
          <!-- Ingredients Section -->
          <h4 class="recipe-section-title">🥘 Ingredients</h4>
          <ul class="ingredients-list">
            ${recipe.ingredients.map((ing) => `<li>${ing}</li>`).join("")}
          </ul>

          <!-- Instructions Section -->
          <h4 class="recipe-section-title">👨‍🍳 Instructions</h4>
          <ol class="instructions-list">
            ${recipe.instructions.map((step) => `<li>${step}</li>`).join("")}
          </ol>
        </div>

        <!-- Recipe Actions -->
        <div class="recipe-actions">
          <button class="btn-save ${isSaved ? "saved" : ""}" data-recipe-name="${recipe.name}">
            ${isSaved ? "❤️ Recipe Saved" : "🤍 Save Recipe"}
          </button>
          <button class="btn-view-modal" data-recipe-index="${index}">
            👁️ View Full Recipe
          </button>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;

  // Attach event listeners to save buttons
  recipes.forEach((recipe) => {
    const card = container.querySelector(
      `[data-recipe-name="${recipe.name}"] .btn-save`,
    );
    card?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isSavedRecipe(recipe.name)) {
        removeSavedRecipe(recipe.name);
        card.classList.remove("saved");
        card.textContent = "🤍 Save Recipe";
      } else {
        saveRecipe(recipe.name);
        card.classList.add("saved");
        card.textContent = "❤️ Recipe Saved";
      }
    });
  });

  // Attach event listeners to "View Full Recipe" buttons
  recipes.forEach((recipe, index) => {
    const viewBtn = container.querySelector(`[data-recipe-index="${index}"]`);
    viewBtn?.addEventListener("click", () => {
      openRecipeModal(recipe);
    });
  });
}
