(function () {
  "use strict";

  var form = document.getElementById("registerForm");
  var errorBox = document.getElementById("regError");
  var submitBtn = document.getElementById("regSubmit");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var payload = {
      name: document.getElementById("regName").value.trim(),
      phone: document.getElementById("regPhone").value.trim(),
      address: document.getElementById("regAddress").value.trim(),
      password: document.getElementById("regPassword").value,
      passwordConfirm: document.getElementById("regPassword2").value,
      website: document.getElementById("regWebsite").value,
    };

    if (!payload.name || !payload.phone || !payload.address || !payload.password) {
      showError("Заполните все поля.");
      return;
    }
    if (payload.password.length < 8) {
      showError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (payload.password !== payload.passwordConfirm) {
      showError("Пароли не совпадают.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Отправляем…";

    fetch("/api/partners/register", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось зарегистрироваться.");
          return data;
        });
      })
      .then(function () {
        window.location.href = "portal.html";
      })
      .catch(function (err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Отправить заявку";
      });
  });
})();
