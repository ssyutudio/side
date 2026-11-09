// Waitlist form: checks the email after typing, locks the button while joining,
// shows the same words for a new or repeated email, and keeps the email on failure.
(function () {
  var form = document.getElementById('join');
  var email = document.getElementById('email');
  var emailErr = document.getElementById('email-err');
  var consent = document.getElementById('consent');
  var consentErr = document.getElementById('consent-err');
  var submit = document.getElementById('submit');
  var fail = document.getElementById('fail');
  var failWhy = document.getElementById('fail-why');
  var done = document.getElementById('done');
  var qrCard = document.getElementById('qr-card');
  var qr = document.getElementById('qr');
  var busy = false;

  // Hide the QR card until the real code exists.
  qr.addEventListener('error', function () { qrCard.hidden = true; });
  if (qr.complete && !qr.naturalWidth) qrCard.hidden = true;

  function emailProblem(v) {
    v = v.trim();
    if (!v) return 'Enter your email address.';
    if (v.indexOf('@') < 0) return 'That email is missing an @, like maya@school.edu';
    var parts = v.split('@');
    if (parts.length !== 2 || !parts[0]) return 'That email has an extra or missing part before the @, like maya@school.edu';
    var domain = parts[1];
    if (!domain || domain.indexOf('.') < 0) return 'That email is missing a part after the @, like maya@school.edu';
    if (/\.$/.test(domain) || /\.\./.test(domain) || /^\./.test(domain)) return 'That email is missing a part after the dot, like maya@school.edu';
    if (/\s/.test(v)) return 'That email has a space in it.';
    return null;
  }

  function showEmailError(msg) {
    if (msg) {
      emailErr.textContent = msg;
      emailErr.hidden = false;
      email.setAttribute('aria-invalid', 'true');
    } else {
      emailErr.hidden = true;
      email.removeAttribute('aria-invalid');
    }
  }

  var touched = false;
  email.addEventListener('blur', function () {
    if (!email.value.trim()) return;
    touched = true;
    showEmailError(emailProblem(email.value));
  });
  email.addEventListener('input', function () {
    if (touched && !emailProblem(email.value)) showEmailError(null);
  });
  consent.addEventListener('change', function () { if (consent.checked) consentErr.hidden = true; });

  function setBusy(on) {
    busy = on;
    submit.disabled = on;
    submit.innerHTML = on ? '<span class="spin" aria-hidden="true"></span> Joining…' : 'Join the waitlist';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    fail.hidden = true;
    touched = true;
    var problem = emailProblem(email.value);
    showEmailError(problem);
    if (problem) { email.focus(); return; }
    if (!consent.checked) { consentErr.hidden = false; consent.focus(); return; }
    setBusy(true);
    fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), consent: true }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body && res.body.ok) {
          form.hidden = true;
          done.hidden = false;
          return;
        }
        setBusy(false);
        if (res.status === 400 && res.body && res.body.reason) {
          showEmailError(res.body.reason);
          return;
        }
        failWhy.textContent = (res.body && res.body.reason ? res.body.reason + ' ' : '') + 'Your email is still here; press Join the waitlist again.';
        fail.hidden = false;
      })
      .catch(function () {
        setBusy(false);
        failWhy.textContent = 'Check your connection and press Join the waitlist again. Your email is still here.';
        fail.hidden = false;
      });
  });
})();
