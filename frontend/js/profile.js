// Backend API URL
const API_URL = "http://localhost:3001";

// Store current recipes and pantry
let currentRecipes = [];
let currentPantry = [];

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  loadAndRenderProfile();
  loadPantry();
  setupReceiptUpload();
  setupPantryActions();
});

// Setup receipt upload functionality
function setupReceiptUpload() {
  const receiptInput = document.getElementById("receiptInput");
  const uploadArea = document.getElementById("uploadArea");

  // File input change
  receiptInput?.addEventListener("change", handleReceiptUpload);

  // Drag and drop
  uploadArea?.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });

  uploadArea?.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea?.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      processReceiptFile(file);
    }
  });
}

// Handle receipt upload
async function handleReceiptUpload(e) {
  const file = e.target.files[0];
  if (file) {
    await processReceiptFile(file);
  }
}

// Process receipt file
async function processReceiptFile(file) {
  const ocrStatus = document.getElementById("ocrStatus");

  // Show processing status
  ocrStatus.classList.remove("hidden");

  try {
    // Send to backend for OCR and AI processing
    const formData = new FormData();
    formData.append("receipt", file);

    const response = await fetch(`${API_URL}/api/process-receipt`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      ocrStatus.classList.add("hidden");
      currentPantry = data.pantry;
      displayPantry(data.pantry);
      showToast(
        `Added ${data.ingredients.length} items to your pantry!`,
        "success",
      );

      // Clear file input
      document.getElementById("receiptInput").value = "";
    } else {
      throw new Error(data.error || "Failed to process receipt");
    }
  } catch (error) {
    console.error("Error processing receipt:", error);
    ocrStatus.classList.add("hidden");
    showToast("Failed to process receipt: " + error.message, "error");
  }
}

// Load pantry from Firebase
async function loadPantry() {
  try {
    const response = await fetch(`${API_URL}/api/pantry`);
    const data = await response.json();

    if (data.success) {
      currentPantry = data.pantry;
      displayPantry(data.pantry);
    }
  } catch (error) {
    console.error("Error loading pantry:", error);
  }
}

// Display pantry items
function displayPantry(pantry) {
  const pantryList = document.getElementById("pantryList");
  const pantryCount = document.getElementById("pantryCount");
  const clearBtn = document.getElementById("clearPantry");

  pantryCount.textContent = `(${pantry.length})`;

  if (pantry.length === 0) {
    pantryList.innerHTML =
      '<p class="empty-pantry">Upload a receipt to get started!</p>';
    clearBtn.classList.add("hidden");
    return;
  }

  clearBtn.classList.remove("hidden");

  let html = "";
  pantry.forEach((item) => {
    html += `
      <div class="pantry-item" data-item-name="${item.name}">
        <div class="item-info">
          <span class="item-name">${item.name}</span>
          ${item.quantity ? `<span class="item-quantity">${item.quantity}</span>` : ""}
        </div>
        <button class="btn-remove-item" data-item-name="${item.name}" title="Remove item">
          ✕
        </button>
      </div>
    `;
  });

  pantryList.innerHTML = html;

  // Attach remove button listeners
  pantry.forEach((item) => {
    const removeBtn = pantryList.querySelector(
      `.btn-remove-item[data-item-name="${item.name}"]`,
    );
    removeBtn?.addEventListener("click", () => removePantryItem(item.name));
  });
}

// Setup pantry actions
function setupPantryActions() {
  const clearBtn = document.getElementById("clearPantry");
  clearBtn?.addEventListener("click", clearPantry);
}

// Remove single pantry item
async function removePantryItem(itemName) {
  try {
    const response = await fetch(
      `${API_URL}/api/pantry/${encodeURIComponent(itemName)}`,
      {
        method: "DELETE",
      },
    );

    const data = await response.json();

    if (data.success) {
      currentPantry = data.pantry;
      displayPantry(data.pantry);
      showToast("Item removed from pantry", "success");
    }
  } catch (error) {
    console.error("Error removing item:", error);
    showToast("Failed to remove item", "error");
  }
}

// Clear entire pantry
async function clearPantry() {
  if (!confirm("Are you sure you want to clear your entire pantry?")) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/pantry`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (data.success) {
      currentPantry = [];
      displayPantry([]);
      showToast("Pantry cleared", "success");
    }
  } catch (error) {
    console.error("Error clearing pantry:", error);
    showToast("Failed to clear pantry", "error");
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

// Recipe Generation functionality
document
  .getElementById("generateBtn")
  ?.addEventListener("click", generateRecipes);

async function generateRecipes() {
  const generateBtn = document.getElementById("generateBtn");
  const loadingMessage = document.getElementById("loadingContainer");
  const recipesContainer = document.getElementById("recipesContainer");

  if (currentPantry.length === 0) {
    showToast("Please add ingredients to your pantry first!", "error");
    return;
  }

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
      body: JSON.stringify({ ingredients: currentPantry }),
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
      const recipe = currentRecipes.find((r) => r.recipeId === recipeId);
      if (recipe) {
        delete recipe.recipeId;
      }
      displayRecipes(currentRecipes, window.currentUserProfile);
    }

    return data;
  } catch (error) {
    console.error("Error unsaving recipe:", error);
    showToast("Failed to remove recipe", "error");
    return { success: false };
  }
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

// Display recipes on the page
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
        <div class="recipe-header">
          <h3>
            <span class="recipe-number">${index + 1}</span>
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

  // Attach event listeners
  recipes.forEach((recipe, index) => {
    const saveBtn = container.querySelector(
      `.btn-save[data-recipe-index="${index}"]`,
    );

    saveBtn?.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (recipe.recipeId) {
        const result = await unsaveRecipe(recipe.recipeId);
        if (result.success) {
          saveBtn.classList.remove("saved");
          saveBtn.innerHTML = "🤍 Save";
          showToast("Recipe removed from saved recipes", "success");
        }
      } else {
        const result = await saveRecipeToFirebase(recipe);
        if (result.success) {
          saveBtn.classList.add("saved");
          saveBtn.innerHTML = "❤️ Saved";
          showToast("Recipe saved successfully!", "success");
        }
      }
    });

    const toggleBtn = container.querySelector(
      `.btn-toggle-expand[data-recipe-index="${index}"]`,
    );

    toggleBtn?.addEventListener("click", () => {
      toggleRecipeExpansion(index);
    });
  });
}
