/* Общие функции для новых страниц админки (Рестораны, Оптовые заказы):
   проверка входа, выход, уведомления, смена пароля, форматирование. */
window.AdminShared = (function () {
  "use strict";

  var toast = document.getElementById("toast");
  var toastTimer = null;

  function showToast(message, isError) {
    toast.textContent = message;
    toast.classList.toggle("is-error", !!isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 3200);
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function money(n) {
    var num = Number(n);
    var s = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(".", ",");
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function blocksWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "блок";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "блока";
    return "блоков";
  }

  // fetch с JSON и обработкой "сессия истекла"
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          window.location.href = "login.html";
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error(data.error || "Ошибка запроса.");
        return data;
      });
    });
  }

  function init(onReady) {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then(function (data) {
        document.getElementById("adminUser").textContent = data.username;
        onReady();
      })
      .catch(function () {
        window.location.href = "login.html";
      });

    document.getElementById("logoutBtn").addEventListener("click", function () {
      fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(function () {
        window.location.href = "login.html";
      });
    });

    /* смена пароля */
    var pwOverlay = document.getElementById("passwordModalOverlay");
    var pwForm = document.getElementById("passwordForm");
    var pwError = document.getElementById("passwordFormError");

    document.getElementById("changePasswordBtn").addEventListener("click", function () {
      pwForm.reset();
      pwError.hidden = true;
      pwOverlay.hidden = false;
    });
    function closePw() { pwOverlay.hidden = true; }
    document.getElementById("passwordModalClose").addEventListener("click", closePw);
    document.getElementById("passwordCancelBtn").addEventListener("click", closePw);
    pwOverlay.addEventListener("click", function (e) { if (e.target === pwOverlay) closePw(); });

    pwForm.addEventListener("submit", function (e) {
      e.preventDefault();
      pwError.hidden = true;
      api("POST", "/api/auth/change-password", {
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
      })
        .then(function () {
          closePw();
          showToast("Пароль изменён");
        })
        .catch(function (err) {
          pwError.textContent = err.message;
          pwError.hidden = false;
        });
    });
  }

  return { init: init, api: api, showToast: showToast, esc: esc, money: money, fmtDate: fmtDate, blocksWord: blocksWord };
})();
