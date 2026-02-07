// Backend API URL
const API_URL = "http://localhost:3001";

// Store current recipes in memory
let currentRecipes = [];

// Modal functionality
function openRecipeModal(recipe) {
  const modal = document.getElementById("recipeModal");

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
  if (recipe.recipeId) {
    saveBtn.classList.add("saved");
    saveBtn.textContent = "✓ Recipe Saved";
  } else {
    saveBtn.classList.remove("saved");
    saveBtn.textContent = "💾 Save Recipe";
  }

  // Store current recipe for save action
  saveBtn.setAttribute("data-recipe-data", JSON.stringify(recipe));

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

  // Save recipe button in modal
  saveBtn?.addEventListener("click", async () => {
    const recipeData = saveBtn.getAttribute("data-recipe-data");
    if (!recipeData) return;

    const recipe = JSON.parse(recipeData);

    if (recipe.recipeId) {
      // Recipe is already saved, unsave it
      await unsaveRecipe(recipe.recipeId);
      saveBtn.classList.remove("saved");
      saveBtn.textContent = "💾 Save Recipe";
      showToast("Recipe removed from saved recipes", "success");
    } else {
      // Save the recipe
      const result = await saveRecipeToFirebase(recipe);
      if (result.success) {
        recipe.recipeId = result.recipeId;
        saveBtn.setAttribute("data-recipe-data", JSON.stringify(recipe));
        saveBtn.classList.add("saved");
        saveBtn.textContent = "✓ Recipe Saved";
        showToast("Recipe saved successfully!", "success");
      }
    }
  });

  // Close modal with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRecipeModal();
    }
  });
});

// Save recipe to Firebase
async function saveRecipeToFirebase(recipe) {
  try {
    const response = await fetch(`${API_URL}/api/recipes/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipe }),
    });

    const data = await response.json();

    if (data.success) {
      // Update the recipe in currentRecipes array
      const recipeIndex = currentRecipes.findIndex(
        (r) => r.name === recipe.name,
      );
      if (recipeIndex !== -1) {
        currentRecipes[recipeIndex].recipeId = data.recipeId;
      }
    }

    return data;
  } catch (error) {
    console.error("Error saving recipe:", error);
    showToast("Failed to save recipe", "error");
    return { success: false };
  }
}

// Unsave recipe from Firebase
async function unsaveRecipe(recipeId) {
  try {
    const response = await fetch(`${API_URL}/api/recipes/save/${recipeId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (data.success) {
      // Remove recipeId from currentRecipes array
      const recipe = currentRecipes.find((r) => r.recipeId === recipeId);
      if (recipe) {
        delete recipe.recipeId;
      }
      // Re-render recipes
      displayRecipes(currentRecipes, window.currentUserProfile);
    }

    return data;
  } catch (error) {
    console.error("Error unsaving recipe:", error);
    showToast("Failed to remove recipe", "error");
    return { success: false };
  }
}

// Show toast notification
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

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
    const response = await fetch(`${API_URL}/api/generate-recipes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ingredients }),
    });

    const data = await response.json();

    if (data.success) {
      currentRecipes = data.recipes;
      window.currentUserProfile = data.userProfile;
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

// Toggle recipe card expansion
function toggleRecipeExpansion(index) {
  const card = document.querySelector(`[data-recipe-index="${index}"]`);
  if (!card) return;

  const content = card.querySelector(".recipe-content");
  const toggleBtn = card.querySelector(".btn-toggle-expand");

  if (card.classList.contains("expanded")) {
    card.classList.remove("expanded");
    content.style.maxHeight = "0";
    toggleBtn.innerHTML = "👁️ View Full Recipe";
  } else {
    // Collapse all other cards first
    document.querySelectorAll(".recipe-card.expanded").forEach((otherCard) => {
      if (otherCard !== card) {
        otherCard.classList.remove("expanded");
        otherCard.querySelector(".recipe-content").style.maxHeight = "0";
        otherCard.querySelector(".btn-toggle-expand").innerHTML =
          "👁️ View Full Recipe";
      }
    });

    card.classList.add("expanded");
    content.style.maxHeight = content.scrollHeight + "px";
    toggleBtn.innerHTML = "🔼 Collapse Recipe";
  }
}

// Display recipes on the page as expandable cards
function displayRecipes(recipes, userProfile) {
  const container = document.getElementById("recipesContainer");
  if (!recipes || recipes.length === 0) {
    container.innerHTML =
      '<div class="message error">No recipes generated</div>';
    return;
  }

  const preferences = userProfile.preferences || {};
  const allergies = Array.isArray(preferences.allergies)
    ? preferences.allergies
    : [];

  let html = "";
  recipes.forEach((recipe, index) => {
    const safetyClass = recipe.isSafe === false ? "unsafe" : "";
    const difficultyClass = `difficulty-${recipe.difficulty}`;
    const isSaved = !!recipe.recipeId;

    html += `
      <article class="recipe-card ${safetyClass}" data-recipe-index="${index}">
        <!-- Recipe Header (Always Visible) -->
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

        <!-- Recipe Content (Collapsible) -->
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
          <button class="btn-save ${isSaved ? "saved" : ""}" data-recipe-index="${index}">
            ${isSaved ? "❤️ Saved" : "🤍 Save"}
          </button>
          <button class="btn-toggle-expand" data-recipe-index="${index}">
            👁️ View Full Recipe
          </button>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;

  // Attach event listeners to save buttons
  recipes.forEach((recipe, index) => {
    const saveBtn = container.querySelector(
      `.btn-save[data-recipe-index="${index}"]`,
    );

    saveBtn?.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (recipe.recipeId) {
        // Unsave recipe
        const result = await unsaveRecipe(recipe.recipeId);
        if (result.success) {
          saveBtn.classList.remove("saved");
          saveBtn.innerHTML = "🤍 Save";
          showToast("Recipe removed from saved recipes", "success");
        }
      } else {
        // Save recipe
        const result = await saveRecipeToFirebase(recipe);
        if (result.success) {
          saveBtn.classList.add("saved");
          saveBtn.innerHTML = "❤️ Saved";
          showToast("Recipe saved successfully!", "success");
        }
      }
    });
  });

  // Attach event listeners to expand/collapse buttons
  recipes.forEach((recipe, index) => {
    const toggleBtn = container.querySelector(
      `.btn-toggle-expand[data-recipe-index="${index}"]`,
    );

    toggleBtn?.addEventListener("click", () => {
      toggleRecipeExpansion(index);
    });
  });
}
