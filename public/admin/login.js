(function () {
  "use strict";

  var form = document.getElementById("loginForm");
  var errorBox = document.getElementById("loginError");
  var submitBtn = document.getElementById("loginSubmit");

  // если уже авторизован — сразу в панель
  fetch("/api/auth/me", { credentials: "same-origin" }).then(function (res) {
    if (res.ok) window.location.href = "dashboard.html";
  });

  var pwInput = document.getElementById("password");
  var pwToggle = document.getElementById("pwToggle");
  pwToggle.addEventListener("click", function () {
    var show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.textContent = show ? "Скрыть" : "Показать";
    pwToggle.setAttribute("aria-pressed", show ? "true" : "false");
    pwToggle.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
    pwInput.focus();
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var password = document.getElementById("password").value;

    if (!password) {
      showError("Введите пароль.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Входим…";

    fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось войти.");
          return data;
        });
      })
      .then(function () {
        window.location.href = "dashboard.html";
      })
      .catch(function (err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Войти";
      });
  });
})();
