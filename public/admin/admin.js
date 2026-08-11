(function () {
  "use strict";

  var CATEGORY_LABELS = {
    fish: "Рыба",
    shrimp: "Креветки",
    squid: "Кальмары",
    caviar: "Икра",
    delicacy: "Морские деликатесы",
    lobster: "Лобстеры",
    other: "Другие",
  };

  var productList = document.getElementById("productList");
  var listStatus = document.getElementById("listStatus");
  var toast = document.getElementById("toast");
  var adminUser = document.getElementById("adminUser");
  var filterPills = Array.prototype.slice.call(document.querySelectorAll("#adminFilterRow .filter-pill"));
  var activeFilter = "all";

  var products = [];

  /* ---------------------------------------------------------
     Проверка авторизации
     --------------------------------------------------------- */
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (res) {
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    })
    .then(function (data) {
      adminUser.textContent = data.username;
      loadProducts();
    })
    .catch(function () {
      window.location.href = "login.html";
    });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(function () {
      window.location.href = "login.html";
    });
  });

  /* ---------------------------------------------------------
     Уведомления
     --------------------------------------------------------- */
  var toastTimer = null;
  function showToast(message, isError) {
    toast.textContent = message;
    toast.classList.toggle("is-error", !!isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 3200);
  }

  /* ---------------------------------------------------------
     Загрузка и рендер списка товаров
     --------------------------------------------------------- */
  function formatPrice(n) {
    var num = Number(n);
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(2).replace(".", ",");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Оптимизация изображений из Cloudinary через URL-transformations (см.
  // такую же функцию в public/script.js — исходники в Cloudinary не
  // трогаем, только просим версию поменьше под конкретное превью).
  // Для локальных data:-превью (только что выбранный, ещё не загруженный
  // файл) и не-Cloudinary ссылок возвращает URL как есть.
  function optimizeCloudinaryUrl(url, width) {
    if (!url || typeof url !== "string") return url;
    if (url.indexOf("res.cloudinary.com") === -1 || url.indexOf("/upload/") === -1) return url;
    return url.replace("/upload/", "/upload/f_auto,q_auto,w_" + width + "/");
  }

  function loadProducts() {
    listStatus.hidden = false;
    listStatus.textContent = "Загружаем товары…";
    fetch("/api/admin/products", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error("Ошибка сети");
        return res.json();
      })
      .then(function (data) {
        products = data;
        renderList();
      })
      .catch(function (err) {
        if (err.message === "unauthorized") {
          window.location.href = "login.html";
          return;
        }
        listStatus.hidden = false;
        listStatus.textContent = "Не удалось загрузить товары. Обновите страницу.";
      });
  }

  function renderList() {
    productList.innerHTML = "";

    var visible = products.filter(function (p) {
      return activeFilter === "all" || p.category === activeFilter;
    });

    if (!products.length) {
      listStatus.hidden = false;
      listStatus.textContent = "Пока нет ни одного товара. Нажмите «Добавить товар».";
      return;
    }
    if (!visible.length) {
      listStatus.hidden = false;
      listStatus.textContent = "В этой категории нет товаров.";
      return;
    }
    listStatus.hidden = true;

    var fragment = document.createDocumentFragment();
    visible.forEach(function (p) {
      fragment.appendChild(buildRow(p));
    });
    productList.appendChild(fragment);
  }

  function buildRow(p) {
    var row = document.createElement("div");
    row.className = "product-row" + (p.inStock ? "" : " is-out");
    row.setAttribute("data-id", p.id);

    var thumbHtml = p.image
      ? '<div class="row-thumb"><img src="' + escapeHtml(optimizeCloudinaryUrl(p.image, 150)) + '" alt=""></div>'
      : '<div class="row-thumb is-empty">Нет фото</div>';

    var priceHtml = '<span class="price-final">' + formatPrice(p.finalPrice) + " смн</span>";
    if (p.discountPercent > 0) {
      priceHtml =
        '<span class="price-old">' + formatPrice(p.price) + " смн</span>" +
        priceHtml +
        '<span class="discount-badge">-' + p.discountPercent + "%</span>";
    }

    row.innerHTML =
      thumbHtml +
      '<div class="row-main">' +
        '<p class="row-name">' + escapeHtml(p.name) + "</p>" +
        '<p class="row-meta">' + escapeHtml(CATEGORY_LABELS[p.category] || p.category) + " · " + escapeHtml(p.weight) + "</p>" +
      "</div>" +
      '<div class="row-price">' + priceHtml + "</div>" +
      '<div class="row-badges">' +
        (p.isNew ? '<span class="badge-new">Новинка</span>' : "") +
      "</div>" +
      '<label class="row-toggle">' +
        '<span class="row-toggle-label">Новинка</span>' +
        '<span class="switch">' +
          '<input type="checkbox" class="toggle-new" ' + (p.isNew ? "checked" : "") + '>' +
          '<span class="switch-track"><span class="switch-thumb"></span></span>' +
        "</span>" +
      "</label>" +
      '<label class="row-toggle">' +
        '<span class="row-toggle-label">В наличии</span>' +
        '<span class="switch">' +
          '<input type="checkbox" class="toggle-stock" ' + (p.inStock ? "checked" : "") + '>' +
          '<span class="switch-track"><span class="switch-thumb"></span></span>' +
        "</span>" +
      "</label>" +
      '<div class="row-actions">' +
        '<button type="button" class="icon-btn edit-btn" title="Редактировать">✎</button>' +
        '<button type="button" class="icon-btn danger delete-btn" title="Удалить">🗑</button>' +
      "</div>";

    row.querySelector(".toggle-new").addEventListener("change", function (e) {
      quickUpdate(p, { isNew: e.target.checked });
    });
    row.querySelector(".toggle-stock").addEventListener("change", function (e) {
      quickUpdate(p, { inStock: e.target.checked });
    });
    row.querySelector(".edit-btn").addEventListener("click", function () {
      openProductModal(p);
    });
    row.querySelector(".delete-btn").addEventListener("click", function () {
      deleteProduct(p);
    });

    return row;
  }

  filterPills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      filterPills.forEach(function (p) { p.classList.remove("is-active"); });
      pill.classList.add("is-active");
      activeFilter = pill.getAttribute("data-filter");
      renderList();
    });
  });

  /* ---------------------------------------------------------
     Быстрое переключение (Новинка / Наличие) без открытия формы
     --------------------------------------------------------- */
  function quickUpdate(product, changes) {
    var formData = new FormData();
    formData.append("name", product.name);
    formData.append("category", product.category);
    formData.append("weight", product.weight);
    formData.append("price", product.price);
    formData.append("discountPercent", product.discountPercent);
    formData.append("isNew", "isNew" in changes ? changes.isNew : product.isNew);
    formData.append("inStock", "inStock" in changes ? changes.inStock : product.inStock);
    // фото не отправляем — сервер оставит текущее изображение без изменений

    fetch("/api/admin/products/" + product.id, {
      method: "PUT",
      credentials: "same-origin",
      body: formData,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось сохранить изменения.");
          return data;
        });
      })
      .then(function (updated) {
        var idx = products.findIndex(function (x) { return x.id === updated.id; });
        if (idx !== -1) products[idx] = updated;
        showToast("Изменения сохранены");
        renderList();
      })
      .catch(function (err) {
        showToast(err.message, true);
        renderList(); // откатываем переключатель к серверному состоянию
      });
  }

  /* ---------------------------------------------------------
     Удаление товара
     --------------------------------------------------------- */
  function deleteProduct(product) {
    var confirmed = window.confirm(
      'Удалить товар «' + product.name + '»? Это действие нельзя отменить.'
    );
    if (!confirmed) return;

    fetch("/api/admin/products/" + product.id, {
      method: "DELETE",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Не удалось удалить товар.");
        products = products.filter(function (x) { return x.id !== product.id; });
        renderList();
        showToast("Товар удалён");
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  /* ---------------------------------------------------------
     Модальное окно добавления / редактирования товара
     --------------------------------------------------------- */
  var overlay = document.getElementById("productModalOverlay");
  var modalTitle = document.getElementById("productModalTitle");
  var productForm = document.getElementById("productForm");
  var formError = document.getElementById("productFormError");

  var fieldId = document.getElementById("productId");
  var fieldName = document.getElementById("fieldName");
  var fieldCategory = document.getElementById("fieldCategory");
  var fieldWeight = document.getElementById("fieldWeight");
  var fieldPrice = document.getElementById("fieldPrice");
  var fieldDiscount = document.getElementById("fieldDiscount");
  var fieldIsNew = document.getElementById("fieldIsNew");
  var fieldInStock = document.getElementById("fieldInStock");
  var computedPrice = document.getElementById("computedPrice");

  var photoInput = document.getElementById("photoInput");
  var photoPreview = document.getElementById("photoPreview");
  var photoPreviewImg = document.getElementById("photoPreviewImg");
  var photoPreviewEmpty = document.getElementById("photoPreviewEmpty");
  var removePhotoBtn = document.getElementById("removePhotoBtn");

  var currentEditingProduct = null;
  var pendingRemoveImage = false;

  function updateComputedPrice() {
    var price = Number(fieldPrice.value) || 0;
    var discount = Number(fieldDiscount.value) || 0;
    var final = Math.round(price * (1 - discount / 100) * 100) / 100;
    computedPrice.textContent = formatPrice(final) + " сомони";
  }
  fieldPrice.addEventListener("input", updateComputedPrice);
  fieldDiscount.addEventListener("input", updateComputedPrice);

  function setPhotoPreview(url) {
    if (url) {
      // url бывает и настоящей Cloudinary-ссылкой (открыли товар на
      // редактирование), и локальным data:-превью только что выбранного
      // файла (ещё не загружен) — optimizeCloudinaryUrl во втором случае
      // просто возвращает его как есть.
      photoPreviewImg.src = optimizeCloudinaryUrl(url, 200);
      photoPreviewImg.hidden = false;
      photoPreviewEmpty.hidden = true;
      removePhotoBtn.hidden = false;
    } else {
      photoPreviewImg.hidden = true;
      photoPreviewImg.src = "";
      photoPreviewEmpty.hidden = false;
      removePhotoBtn.hidden = true;
    }
  }

  function openProductModal(product) {
    currentEditingProduct = product || null;
    pendingRemoveImage = false;
    formError.hidden = true;
    photoInput.value = "";

    if (product) {
      modalTitle.textContent = "Редактировать товар";
      fieldId.value = product.id;
      fieldName.value = product.name;
      fieldCategory.value = product.category;
      fieldWeight.value = product.weight;
      fieldPrice.value = product.price;
      fieldDiscount.value = product.discountPercent;
      fieldIsNew.checked = product.isNew;
      fieldInStock.value = product.inStock ? "true" : "false";
      setPhotoPreview(product.image);
    } else {
      modalTitle.textContent = "Добавить товар";
      fieldId.value = "";
      productForm.reset();
      fieldDiscount.value = 0;
      fieldInStock.value = "true";
      setPhotoPreview(null);
    }

    updateComputedPrice();
    overlay.hidden = false;
    fieldName.focus();
  }

  function closeProductModal() {
    overlay.hidden = true;
    currentEditingProduct = null;
  }

  document.getElementById("addProductBtn").addEventListener("click", function () {
    openProductModal(null);
  });
  document.getElementById("productModalClose").addEventListener("click", closeProductModal);
  document.getElementById("productCancelBtn").addEventListener("click", closeProductModal);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeProductModal();
  });

  photoInput.addEventListener("change", function () {
    var file = photoInput.files[0];
    if (!file) return;
    pendingRemoveImage = false;
    var reader = new FileReader();
    reader.onload = function (e) {
      setPhotoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  });

  removePhotoBtn.addEventListener("click", function () {
    photoInput.value = "";
    pendingRemoveImage = true;
    setPhotoPreview(null);
  });

  productForm.addEventListener("submit", function (e) {
    e.preventDefault();
    formError.hidden = true;

    var name = fieldName.value.trim();
    var weight = fieldWeight.value.trim();
    var price = fieldPrice.value;
    var discount = fieldDiscount.value || 0;

    if (!name || !weight || price === "") {
      formError.textContent = "Заполните название, вес и цену.";
      formError.hidden = false;
      return;
    }

    var formData = new FormData();
    formData.append("name", name);
    formData.append("category", fieldCategory.value);
    formData.append("weight", weight);
    formData.append("price", price);
    formData.append("discountPercent", discount);
    formData.append("isNew", fieldIsNew.checked);
    formData.append("inStock", fieldInStock.value === "true");

    if (photoInput.files[0]) {
      formData.append("image", photoInput.files[0]);
    } else if (pendingRemoveImage) {
      formData.append("removeImage", "true");
    }

    var isEdit = !!fieldId.value;
    var url = isEdit ? "/api/admin/products/" + fieldId.value : "/api/admin/products";
    var method = isEdit ? "PUT" : "POST";

    var saveBtn = document.getElementById("productSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Сохраняем…";

    fetch(url, { method: method, credentials: "same-origin", body: formData })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось сохранить товар.");
          return data;
        });
      })
      .then(function (saved) {
        if (isEdit) {
          var idx = products.findIndex(function (x) { return x.id === saved.id; });
          if (idx !== -1) products[idx] = saved;
        } else {
          products.unshift(saved);
        }
        renderList();
        closeProductModal();
        showToast(isEdit ? "Товар обновлён" : "Товар добавлен");
      })
      .catch(function (err) {
        formError.textContent = err.message;
        formError.hidden = false;
      })
      .finally(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = "Сохранить";
      });
  });

  /* ---------------------------------------------------------
     Смена пароля
     --------------------------------------------------------- */
  var pwOverlay = document.getElementById("passwordModalOverlay");
  var pwForm = document.getElementById("passwordForm");
  var pwError = document.getElementById("passwordFormError");

  document.getElementById("changePasswordBtn").addEventListener("click", function () {
    pwForm.reset();
    pwError.hidden = true;
    pwOverlay.hidden = false;
  });
  document.getElementById("passwordModalClose").addEventListener("click", function () {
    pwOverlay.hidden = true;
  });
  document.getElementById("passwordCancelBtn").addEventListener("click", function () {
    pwOverlay.hidden = true;
  });
  pwOverlay.addEventListener("click", function (e) {
    if (e.target === pwOverlay) pwOverlay.hidden = true;
  });

  pwForm.addEventListener("submit", function (e) {
    e.preventDefault();
    pwError.hidden = true;

    var currentPassword = document.getElementById("currentPassword").value;
    var newPassword = document.getElementById("newPassword").value;

    fetch("/api/auth/change-password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось сменить пароль.");
          return data;
        });
      })
      .then(function () {
        pwOverlay.hidden = true;
        showToast("Пароль изменён");
      })
      .catch(function (err) {
        pwError.textContent = err.message;
        pwError.hidden = false;
      });
  });
})();
