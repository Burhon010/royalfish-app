(function () {
  "use strict";

  var promoList = document.getElementById("promoList");
  var listStatus = document.getElementById("listStatus");
  var toast = document.getElementById("toast");
  var adminUser = document.getElementById("adminUser");

  var addSlideForm = document.getElementById("addSlideForm");
  var newSlideImage = document.getElementById("newSlideImage");
  var newSlideTitle = document.getElementById("newSlideTitle");
  var addSlideBtn = document.getElementById("addSlideBtn");
  var addSlideError = document.getElementById("addSlideError");

  var slides = [];
  var listBusy = false; // блокирует одновременные операции (переключение/порядок/замена/удаление),
                         // чтобы быстрые повторные клики не создавали гонку запросов

  function setListBusy(state) {
    listBusy = state;
    promoList.classList.toggle("is-busy", state);
  }

  /* ---------------------------------------------------------
     Проверка авторизации (как на остальных страницах админки)
     --------------------------------------------------------- */
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (res) {
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    })
    .then(function (data) {
      adminUser.textContent = data.username;
      loadSlides();
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Оптимизация изображений из Cloudinary через URL-transformations (см.
  // такую же функцию в public/script.js и admin.js) — исходники в
  // Cloudinary не трогаем, только просим версию поменьше под миниатюру.
  function optimizeCloudinaryUrl(url, width) {
    if (!url || typeof url !== "string") return url;
    if (url.indexOf("res.cloudinary.com") === -1 || url.indexOf("/upload/") === -1) return url;
    return url.replace("/upload/", "/upload/f_auto,q_auto,w_" + width + "/");
  }

  /* ---------------------------------------------------------
     Загрузка и рендер списка слайдов
     --------------------------------------------------------- */
  function loadSlides() {
    listStatus.hidden = false;
    listStatus.textContent = "Загружаем слайды…";
    fetch("/api/admin/promo-slides", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) throw new Error("unauthorized");
        if (!res.ok) throw new Error("Ошибка сети");
        return res.json();
      })
      .then(function (data) {
        slides = data;
        renderList();
      })
      .catch(function (err) {
        if (err.message === "unauthorized") {
          window.location.href = "login.html";
          return;
        }
        listStatus.hidden = false;
        listStatus.textContent = "Не удалось загрузить слайды. Обновите страницу.";
      });
  }

  function renderList() {
    promoList.innerHTML = "";

    if (!slides.length) {
      listStatus.hidden = false;
      listStatus.textContent = "Слайдов пока нет. Добавьте первый выше — на сайте блок появится сразу после этого.";
      return;
    }
    listStatus.hidden = true;

    var fragment = document.createDocumentFragment();
    slides.forEach(function (slide, index) {
      fragment.appendChild(buildRow(slide, index === 0, index === slides.length - 1));
    });
    promoList.appendChild(fragment);
  }

  function buildRow(slide, isFirst, isLast) {
    var row = document.createElement("div");
    row.className = "promo-row" + (slide.isActive ? "" : " promo-row--inactive");
    row.setAttribute("data-id", slide.id);

    row.innerHTML =
      '<div class="promo-row-media">' +
        '<img src="' + escapeHtml(optimizeCloudinaryUrl(slide.image, 200)) + '" alt="">' +
      "</div>" +
      '<div class="promo-row-body">' +
        '<p class="promo-row-title">' + (slide.title ? escapeHtml(slide.title) : '<span class="promo-row-title--empty">без подписи</span>') + "</p>" +
        '<label class="promo-toggle">' +
          '<input type="checkbox" class="toggle-active"' + (slide.isActive ? " checked" : "") + '>' +
          '<span>' + (slide.isActive ? "Показывается на сайте" : "Скрыт") + "</span>" +
        "</label>" +
      "</div>" +
      '<div class="promo-row-actions">' +
        '<button type="button" class="icon-btn move-up" title="Сдвинуть вверх"' + (isFirst ? " disabled" : "") + ">&uarr;</button>" +
        '<button type="button" class="icon-btn move-down" title="Сдвинуть вниз"' + (isLast ? " disabled" : "") + ">&darr;</button>" +
        '<label class="icon-btn replace-btn" title="Заменить фото">' +
          "&#128247;" +
          '<input type="file" class="replace-input" accept="image/jpeg,image/png,image/webp" hidden>' +
        "</label>" +
        '<button type="button" class="icon-btn danger delete-btn" title="Удалить">&times;</button>' +
      "</div>";

    row.querySelector(".toggle-active").addEventListener("change", function (e) {
      toggleActive(slide, e.target.checked, row);
    });
    row.querySelector(".move-up").addEventListener("click", function () {
      moveSlide(slide.id, "up");
    });
    row.querySelector(".move-down").addEventListener("click", function () {
      moveSlide(slide.id, "down");
    });
    row.querySelector(".replace-input").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        replaceImage(slide, e.target.files[0]);
      }
    });
    row.querySelector(".delete-btn").addEventListener("click", function () {
      deleteSlide(slide);
    });

    return row;
  }

  /* ---------------------------------------------------------
     Добавление нового слайда
     --------------------------------------------------------- */
  addSlideForm.addEventListener("submit", function (e) {
    e.preventDefault();
    addSlideError.hidden = true;

    if (listBusy) {
      addSlideError.textContent = "Подождите, предыдущее действие ещё выполняется…";
      addSlideError.hidden = false;
      return;
    }

    var file = newSlideImage.files && newSlideImage.files[0];
    if (!file) {
      addSlideError.textContent = "Выберите изображение.";
      addSlideError.hidden = false;
      return;
    }

    var formData = new FormData();
    formData.append("image", file);
    if (newSlideTitle.value.trim()) formData.append("title", newSlideTitle.value.trim());

    setListBusy(true);
    addSlideBtn.disabled = true;
    addSlideBtn.textContent = "Загружаем…";

    fetch("/api/admin/promo-slides", {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось добавить слайд.");
          return data;
        });
      })
      .then(function (created) {
        slides.push(created);
        renderList();
        addSlideForm.reset();
        showToast("Слайд добавлен");
      })
      .catch(function (err) {
        addSlideError.textContent = err.message;
        addSlideError.hidden = false;
      })
      .finally(function () {
        addSlideBtn.disabled = false;
        addSlideBtn.textContent = "Добавить слайд";
        setListBusy(false);
      });
  });

  /* ---------------------------------------------------------
     Показать/скрыть, заменить фото, переместить, удалить
     --------------------------------------------------------- */
  function toggleActive(slide, isActive, rowEl) {
    if (listBusy) {
      rowEl.querySelector(".toggle-active").checked = !isActive; // откатываем, пока идёт другая операция
      showToast("Подождите, предыдущее действие ещё выполняется…", true);
      return;
    }
    setListBusy(true);

    var formData = new FormData();
    formData.append("isActive", isActive ? "true" : "false");

    fetch("/api/admin/promo-slides/" + slide.id, {
      method: "PUT",
      credentials: "same-origin",
      body: formData,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось изменить слайд.");
          return data;
        });
      })
      .then(function (updated) {
        slide.isActive = updated.isActive;
        rowEl.classList.toggle("promo-row--inactive", !updated.isActive);
        rowEl.querySelector(".promo-toggle span").textContent = updated.isActive ? "Показывается на сайте" : "Скрыт";
        showToast(updated.isActive ? "Слайд включён" : "Слайд скрыт с сайта");
      })
      .catch(function (err) {
        rowEl.querySelector(".toggle-active").checked = !isActive; // откатываем чекбокс
        showToast(err.message, true);
      })
      .finally(function () {
        setListBusy(false);
      });
  }

  function replaceImage(slide, file) {
    if (listBusy) {
      showToast("Подождите, предыдущее действие ещё выполняется…", true);
      return;
    }
    setListBusy(true);

    var formData = new FormData();
    formData.append("image", file);

    showToast("Загружаем новое фото…");

    fetch("/api/admin/promo-slides/" + slide.id, {
      method: "PUT",
      credentials: "same-origin",
      body: formData,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось заменить фото.");
          return data;
        });
      })
      .then(function (updated) {
        var idx = slides.findIndex(function (s) { return s.id === slide.id; });
        if (idx !== -1) slides[idx] = updated;
        renderList();
        showToast("Фото заменено");
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        setListBusy(false);
      });
  }

  function moveSlide(id, direction) {
    if (listBusy) return; // кнопки и так задизейблены через CSS .is-busy, но подстрахуемся
    setListBusy(true);

    fetch("/api/admin/promo-slides/" + id + "/move", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: direction }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось изменить порядок.");
          return data;
        });
      })
      .then(function (updatedList) {
        slides = updatedList;
        renderList();
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        setListBusy(false);
      });
  }

  function deleteSlide(slide) {
    if (!window.confirm("Удалить этот слайд? Отменить будет нельзя.")) return;
    if (listBusy) {
      showToast("Подождите, предыдущее действие ещё выполняется…", true);
      return;
    }
    setListBusy(true);

    fetch("/api/admin/promo-slides/" + slide.id, {
      method: "DELETE",
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось удалить слайд.");
          return data;
        });
      })
      .then(function () {
        slides = slides.filter(function (s) { return s.id !== slide.id; });
        renderList();
        showToast("Слайд удалён");
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        setListBusy(false);
      });
  }

  /* ---------------------------------------------------------
     Смена пароля (тот же функционал, что и на других страницах)
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
