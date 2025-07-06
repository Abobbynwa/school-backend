// 1) Overlay open/close
const overlay = document.getElementById('overlayNav');
document.getElementById('openNav').addEventListener('click', () => {
  overlay.classList.add('open');
});
document.getElementById('closeNav').addEventListener('click', () => {
  overlay.classList.remove('open');
});

// 2) Scroll‐reveal
const observers = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries, obs) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('show');
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
observers.forEach(el => io.observe(el));

// 3) Contact form
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    alert(`Thank you, ${contactForm.name.value}! Your message has been sent.`);
    contactForm.reset();
  });
}

// 4) Registration form
const regForm = document.getElementById('registrationForm');
if (regForm) {
  regForm.addEventListener('submit', e => {
    e.preventDefault();
    alert(`Thanks, ${regForm.fullName.value}! We’ll get back to you soon.`);
    regForm.reset();
  });
}
// Newsletter subscribe
const newsletterForm = document.getElementById('newsletterForm');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', e => {
    e.preventDefault();
    alert(`Thanks for subscribing, ${newsletterForm.email.value}!`);
    newsletterForm.reset();
  });
}

// Back to top smooth scroll
document.querySelector('.back-to-top').addEventListener('click', e => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
// ─────────────────────────────────────────
// Typewriter Effect
// ─────────────────────────────────────────
const phrases = [
  "Empowering Tomorrow’s Leaders",
  "Innovating Education Daily",
  "Building Bright Futures"
];
let idx = 0, charIdx = 0, current = '', isDeleting = false;
const typeEl = document.getElementById('typewriter');

function type() {
  const full = phrases[idx];
  if (isDeleting) {
    current = full.substring(0, charIdx--);
  } else {
    current = full.substring(0, charIdx++);
  }
  typeEl.textContent = current;
  if (!isDeleting && charIdx === full.length + 1) {
    isDeleting = true;
    setTimeout(type, 1000);
  } else if (isDeleting && charIdx === 0) {
    isDeleting = false;
    idx = (idx + 1) % phrases.length;
    setTimeout(type, 500);
  } else {
    setTimeout(type, isDeleting ? 50 : 100);
  }
}
document.addEventListener('DOMContentLoaded', type);

// ─────────────────────────────────────────
// Count-Up Stats
// ─────────────────────────────────────────
const counters = document.querySelectorAll('.counter');
const statsSection = document.querySelector('.stats-section');
let statsRun = false;
function runCounters() {
  counters.forEach(counter => {
    const update = () => {
      const target = +counter.dataset.target;
      const count = +counter.textContent;
      const inc = Math.ceil(target / 200);
      if (count < target) {
        counter.textContent = count + inc;
        setTimeout(update, 10);
      } else {
        counter.textContent = target;
      }
    };
    update();
  });
}
new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !statsRun) {
    statsRun = true;
    runCounters();
  }
}, { threshold: 0.5 }).observe(statsSection);

// ─────────────────────────────────────────
// Testimonial Slider
// ─────────────────────────────────────────
const slides = document.querySelectorAll('.testimonial-item');
let slideIdx = 0;
function showSlide(i) {
  slides.forEach((s, idx) => {
    s.classList.toggle('active', idx === i);
  });
}
function nextSlide() {
  slideIdx = (slideIdx + 1) % slides.length;
  showSlide(slideIdx);
}
showSlide(0);
setInterval(nextSlide, 5000);

const form = document.getElementById('registrationForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      full_name:     form.fullName.value,
      student_class: form.studentClass.value,
      dob:            form.dob.value,
      gender:        form.gender.value,
      parent_name:   form.parentName.value,
      parent_email:  form.parentEmail.value,
      parent_phone:  form.parentPhone.value
    };

    const res = await fetch("http://127.0.0.1:8000/api/register", {
      method:  "POST",
      headers: {"Content-Type":"application/json"},
      body:    JSON.stringify(data)
    });

    if (res.ok) {
      const { id, message } = await res.json();
      alert(`${message} Your registration ID is ${id}. We’ll get back to you soon.`);
      form.reset();
    } else {
      const err = await res.text();
      alert("Error: " + err);
    }
  });