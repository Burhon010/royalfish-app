(function () {
  "use strict";

  var form = document.getElementById("loginForm");
  var errorBox = document.getElementById("loginError");
  var submitBtn = document.getElementById("loginSubmit");

  // если уже авторизован — сразу в панель
  fetch("/api/auth/me", { credentials: "same-origin" }).then(function (res) {
    if (res.ok) window.location.href = "dashboard.html";
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var username = document.getElementById("username").value.trim();
    var password = document.getElementById("password").value;

    if (!username || !password) {
      showError("Введите логин и пароль.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Входим…";

    fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
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
