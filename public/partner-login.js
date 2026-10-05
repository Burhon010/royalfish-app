(function () {
  "use strict";

  var form = document.getElementById("loginForm");
  var errorBox = document.getElementById("loginError");
  var submitBtn = document.getElementById("loginSubmit");

  // уже вошли — сразу в кабинет
  fetch("/api/partners/me", { credentials: "same-origin" }).then(function (res) {
    if (res.ok) window.location.href = "portal.html";
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var name = document.getElementById("loginName").value.trim();
    var password = document.getElementById("loginPassword").value;
    if (!name || !password) {
      showError("Введите название ресторана и пароль.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Входим…";

    fetch("/api/partners/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Не удалось войти.");
          return data;
        });
      })
      .then(function () {
        window.location.href = "portal.html";
      })
      .catch(function (err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Войти";
      });
  });
})();
