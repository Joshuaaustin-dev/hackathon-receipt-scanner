// Backend API URL
const API_URL = "http://localhost:3001";

// Store current recipes
let savedRecipes = [];

// Load saved recipes on page load
document.addEventListener("DOMContentLoaded", () => {
  loadSavedRecipes();
  setupModalListeners();
});

// Load saved recipes from Firebase
async function loadSavedRecipes() {
  const loadingContainer = document.getElementById("loadingContainer");
  const emptyState = document.getElementById("emptyState");
  const recipesGrid = document.getElementById("recipesGrid");

  try {
    loadingContainer.classList.remove("hidden");
    emptyState.classList.add("hidden");
    recipesGrid.classList.add("hidden");

    console.log("Loading saved recipes from Firebase...");
    const response = await fetch(`${API_URL}/api/recipes/saved`);
    const data = await response.json();

    loadingContainer.classList.add("hidden");

    if (data.success && data.recipes.length > 0) {
      console.log("Loaded", data.recipes.length, "saved recipes");
      savedRecipes = data.recipes;
      displayRecipes(data.recipes);
      recipesGrid.classList.remove("hidden");
    } else {
      console.log("No saved recipes found");
      emptyState.classList.remove("hidden");
    }
  } catch (error) {
    console.error("Error loading saved recipes:", error);
    loadingContainer.classList.add("hidden");
    emptyState.classList.remove("hidden");
    showToast("Failed to load recipes", "error");
  }
}

// Display recipes in grid
function displayRecipes(recipes) {
  const recipesGrid = document.getElementById("recipesGrid");

  let html = "";

  recipes.forEach((recipe, index) => {
    const safetyClass = recipe.isSafe === false ? "unsafe" : "";
    const difficultyClass = `difficulty-${recipe.difficulty}`;

    html += `
      <article class="recipe-card saved ${safetyClass}" data-recipe-index="${index}">
        <div class="recipe-header">
          <h3>
            <span class="recipe-number">❤️</span>
            ${recipe.name}
          </h3>
          <p class="description">${recipe.description || ""}</p>
          
          <div class="recipe-meta">
            <span class="meta-item">⏱️ Prep: ${recipe.prepTime || "N/A"}</span>
            <span class="meta-item">🔥 Cook: ${recipe.cookTime || "N/A"}</span>
            <span class="meta-item">🍽️ Servings: ${recipe.servings || "N/A"}</span>
            <span class="meta-item ${difficultyClass}">📊 ${recipe.difficulty || "medium"}</span>
          </div>

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

        ${
          recipe.allergenWarning && recipe.allergenWarning !== "None"
            ? `
          <div class="allergen-warning">
            ${recipe.allergenWarning}
          </div>
        `
            : ""
        }

        <div class="recipe-content">
          <h4 class="recipe-section-title">🥘 Ingredients</h4>
          <ul class="ingredients-list">
            ${recipe.ingredients.map((ing) => `<li>${ing}</li>`).join("")}
          </ul>

          <h4 class="recipe-section-title">👨‍🍳 Instructions</h4>
          <ol class="instructions-list">
            ${recipe.instructions.map((step) => `<li>${step}</li>`).join("")}
          </ol>
        </div>

        <div class="recipe-actions">
          <button class="btn-delete" data-recipe-index="${index}">
            🗑️ Delete
          </button>
          <button class="btn-toggle-expand" data-recipe-index="${index}">
            👁️ View Full Recipe
          </button>
        </div>
      </article>
    `;
  });

  recipesGrid.innerHTML = html;

  // Attach event listeners
  recipes.forEach((recipe, index) => {
    // Delete button
    const deleteBtn = recipesGrid.querySelector(
      `.btn-delete[data-recipe-index="${index}"]`,
    );

    deleteBtn?.addEventListener("click", async () => {
      if (confirm(`Are you sure you want to delete "${recipe.name}"?`)) {
        await deleteRecipe(recipe.recipeId);
      }
    });

    // Expand button
    const toggleBtn = recipesGrid.querySelector(
      `.btn-toggle-expand[data-recipe-index="${index}"]`,
    );

    toggleBtn?.addEventListener("click", () => {
      toggleRecipeExpansion(index);
    });
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

// Delete recipe from Firebase
async function deleteRecipe(recipeId) {
  try {
    console.log("Deleting recipe:", recipeId);
    const response = await fetch(`${API_URL}/api/recipes/save/${recipeId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (data.success) {
      showToast("Recipe deleted successfully", "success");
      // Reload recipes
      await loadSavedRecipes();
    } else {
      showToast("Failed to delete recipe", "error");
    }
  } catch (error) {
    console.error("Error deleting recipe:", error);
    showToast("Failed to delete recipe", "error");
  }
}

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

  // Store recipe ID for delete action
  const deleteBtn = document.getElementById("modalDeleteBtn");
  deleteBtn.setAttribute("data-recipe-id", recipe.recipeId);

  // Show modal
  modal.classList.add("active");
}

function closeRecipeModal() {
  const modal = document.getElementById("recipeModal");
  modal.classList.remove("active");
}

// Setup modal listeners
function setupModalListeners() {
  const modal = document.getElementById("recipeModal");
  const closeBtn = document.querySelector(".modal-close");
  const closeBtnFooter = document.querySelector(".btn-modal-close");
  const deleteBtn = document.getElementById("modalDeleteBtn");

  closeBtn?.addEventListener("click", closeRecipeModal);
  closeBtnFooter?.addEventListener("click", closeRecipeModal);

  // Close modal when clicking backdrop
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeRecipeModal();
    }
  });

  // Delete button in modal
  deleteBtn?.addEventListener("click", async () => {
    const recipeId = deleteBtn.getAttribute("data-recipe-id");
    if (!recipeId) return;

    const recipe = savedRecipes.find((r) => r.recipeId === recipeId);
    if (
      recipe &&
      confirm(`Are you sure you want to delete "${recipe.name}"?`)
    ) {
      closeRecipeModal();
      await deleteRecipe(recipeId);
    }
  });

  // Close modal with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRecipeModal();
    }
  });
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
