// Altere aqui as informações principais da barbearia.
const BARBERSHOP = {
  whatsappNumber: "5538998825000", // Troque para o número real. Exemplo: 5538999799827
  city: "Carbonita/MG",
};

// Chave usada pelo site e pelo painel administrativo para salvar/ler os agendamentos no navegador.
const BOOKINGS_STORAGE_KEY = "dkBarberBookings";


// Login do painel administrativo via Supabase Auth.
// Use preferencialmente o cliente Supabase que já existe no projeto.
// Caso ainda não exista, preencha as credenciais públicas abaixo ou defina window.DK_SUPABASE_CONFIG antes deste script.
const ADMIN_AUTH_CONFIG = {
  supabaseUrl: window.DK_SUPABASE_CONFIG?.url || window.SUPABASE_URL || "",
  supabaseAnonKey: window.DK_SUPABASE_CONFIG?.anonKey || window.SUPABASE_ANON_KEY || "",

  // Segurança extra opcional: coloque aqui os e-mails que podem acessar o painel.
  // Se a lista ficar vazia, qualquer usuário autenticado no Supabase poderá abrir o painel.
  allowedEmails: window.DK_SUPABASE_CONFIG?.allowedEmails || [],
};

let pendingAdminOpenTab = "bookings";
let pendingAdminOpenCallback = null;
let dkSupabaseClient = window.dkSupabaseClient || window.supabaseClient || null;

function getAdminSupabaseClient() {
  if (dkSupabaseClient) return dkSupabaseClient;

  if (window.supabase?.createClient && ADMIN_AUTH_CONFIG.supabaseUrl && ADMIN_AUTH_CONFIG.supabaseAnonKey) {
    dkSupabaseClient = window.supabase.createClient(
      ADMIN_AUTH_CONFIG.supabaseUrl,
      ADMIN_AUTH_CONFIG.supabaseAnonKey
    );
    window.dkSupabaseClient = dkSupabaseClient;
    return dkSupabaseClient;
  }

  return null;
}

function isAuthorizedAdminUser(user) {
  const allowedEmails = Array.isArray(ADMIN_AUTH_CONFIG.allowedEmails)
    ? ADMIN_AUTH_CONFIG.allowedEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean)
    : [];

  if (!allowedEmails.length) return true;
  return allowedEmails.includes(String(user?.email || "").toLowerCase());
}

async function isAdminAuthenticated() {
  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) return false;

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data?.session?.user) return false;
    return isAuthorizedAdminUser(data.session.user);
  } catch (error) {
    console.error("Erro ao verificar sessão administrativa no Supabase.", error);
    return false;
  }
}

function getAdminLoginElements() {
  return {
    overlay: document.getElementById("adminLoginOverlay"),
    form: document.getElementById("adminLoginForm"),
    username: document.getElementById("adminUsername"),
    password: document.getElementById("adminPassword"),
    message: document.getElementById("adminLoginMessage"),
    submitButton: document.getElementById("adminLoginSubmitButton"),
  };
}

function openAdminLoginModal(tab = "bookings", onSuccess) {
  const { overlay, username, password, message, submitButton } = getAdminLoginElements();
  if (!overlay) {
    if (typeof onSuccess === "function") onSuccess(tab);
    return;
  }

  pendingAdminOpenTab = tab || "bookings";
  pendingAdminOpenCallback = onSuccess;

  overlay.hidden = false;
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-login-open");

  if (username) username.value = "";
  if (password) password.value = "";
  if (message) message.textContent = "";
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Entrar no painel";
  }

  setTimeout(() => username?.focus(), 0);
}

function closeAdminLoginModal() {
  const { overlay, message, submitButton } = getAdminLoginElements();
  if (!overlay) return;

  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
  document.body.classList.remove("admin-login-open");
  if (message) message.textContent = "";
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Entrar no painel";
  }
}

async function requestAdminAccess(tab = "bookings", onSuccess) {
  if (await isAdminAuthenticated()) {
    if (typeof onSuccess === "function") onSuccess(tab);
    return;
  }

  openAdminLoginModal(tab, onSuccess);
}

async function signOutAdmin() {
  const supabaseClient = getAdminSupabaseClient();

  try {
    await supabaseClient?.auth.signOut();
  } catch (error) {
    console.error("Erro ao sair do Supabase Auth.", error);
  }
}

function initAdminLogin() {
  const { overlay, form, username, password, message, submitButton } = getAdminLoginElements();
  const closeButton = document.getElementById("closeAdminLoginButton");
  if (!overlay || !form || !username || !password) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) {
      if (message) {
        message.textContent = "Supabase não configurado. Informe a URL e a chave anon pública do projeto.";
      }
      return;
    }

    const email = username.value.trim();
    const userPassword = password.value;

    if (!email || !userPassword) {
      if (message) message.textContent = "Informe e-mail e senha para acessar.";
      return;
    }

    if (message) message.textContent = "Validando acesso...";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Entrando...";
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: userPassword,
    });

    if (error || !data?.user) {
      if (message) message.textContent = "E-mail ou senha incorretos. Tente novamente.";
      password.value = "";
      password.focus();
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Entrar no painel";
      }
      return;
    }

    if (!isAuthorizedAdminUser(data.user)) {
      await supabaseClient.auth.signOut();
      if (message) message.textContent = "Este usuário não tem permissão para acessar o painel.";
      password.value = "";
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Entrar no painel";
      }
      return;
    }

    closeAdminLoginModal();

    if (typeof pendingAdminOpenCallback === "function") {
      pendingAdminOpenCallback(pendingAdminOpenTab || "bookings");
    }
  });

  closeButton?.addEventListener("click", closeAdminLoginModal);
  overlay.querySelectorAll("[data-close-admin-login]").forEach((element) => {
    element.addEventListener("click", closeAdminLoginModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("open")) {
      closeAdminLoginModal();
    }
  });
}

const professionals = [
  {
    id: "denner",
    name: "Denner Kerlon",
    role: "Barbeiro especialista",
    initial: "D",
    note: "Mais procurado",
  },
  {
    id: "joao",
    name: "João Barber",
    role: "Corte e barba",
    initial: "J",
    note: "Disponível hoje",
  },
];

const services = [
  { id: "pe-barba", name: "PE + Barba", duration: "30 min", price: "R$ 20,00", image: "./PE%20%2B%20Barba.png" },
  { id: "cabelo", name: "Cabelo", duration: "40 min", price: "R$ 30,00", image: "./Cabelo.png" },
  { id: "barba-cabelo", name: "Barba + Cabelo", duration: "1h", price: "R$ 45,00", image: "./Barba%20%2B%20Cabelo.png" },
  { id: "corte-pigmentacao", name: "Corte + Pigmentação", duration: "1h", price: "R$ 55,00", image: "./Corte%20%2B%20Pigmenta%C3%A7%C3%A3o.png" },
];

// Horários em intervalos de 30 minutos.
const availableTimes = [
  "07:00 - 07:30",
  "07:30 - 08:00",
  "08:00 - 08:30",
  "08:30 - 09:00",
  "09:00 - 09:30",
  "09:30 - 10:00",
  "10:00 - 10:30",
  "10:30 - 11:00",
  "11:00 - 11:30",
  "11:30 - 12:00",
  "12:00 - 12:30",
  "12:30 - 13:00",
  "13:00 - 13:30",
  "13:30 - 14:00",
  "14:00 - 14:30",
  "14:30 - 15:00",
  "15:00 - 15:30",
  "15:30 - 16:00",
  "16:00 - 16:30",
  "16:30 - 17:00",
  "17:00 - 17:30",
  "17:30 - 18:00",
  "18:00 - 18:30",
  "18:30 - 19:00",
  "19:00 - 19:30",
  "19:30 - 20:00",
];

// Clientes fixos: estes horários ficam indisponíveis automaticamente por dia da semana.
// 4 = quinta-feira | 5 = sexta-feira
const fixedUnavailableTimesByWeekday = {
  4: ["09:00", "16:30", "17:00", "18:00", "18:30"],
  5: ["08:00", "10:00", "13:00", "14:00", "16:00", "17:00", "17:30", "19:30"],
};

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Regras de funcionamento da barbearia.
// Segunda a sexta: 07:30-11:00 e 13:00-20:00.
// Sábado: 07:30-17:00.
// Domingo: fechado.
const BUSINESS_HOURS_BY_WEEKDAY = {
  0: [],
  1: [{ start: "07:30", end: "11:00" }, { start: "13:00", end: "20:00" }],
  2: [{ start: "07:30", end: "11:00" }, { start: "13:00", end: "20:00" }],
  3: [{ start: "07:30", end: "11:00" }, { start: "13:00", end: "20:00" }],
  4: [{ start: "07:30", end: "11:00" }, { start: "13:00", end: "20:00" }],
  5: [{ start: "07:30", end: "11:00" }, { start: "13:00", end: "20:00" }],
  6: [{ start: "07:30", end: "17:00" }],
};

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "").trim().split(":").map(Number);
  return (hours * 60) + (minutes || 0);
}

function getTimeEnd(timeRange) {
  return String(timeRange || "").split("-")[1]?.trim() || "";
}

function isDateClosed(date) {
  return !date || !BUSINESS_HOURS_BY_WEEKDAY[date.getDay()]?.length;
}

function getBusinessHoursForDate(date) {
  return BUSINESS_HOURS_BY_WEEKDAY[date?.getDay?.()] || [];
}

function isTimeInsideBusinessHoursForDate(timeRange, date) {
  if (!date || isDateClosed(date)) return false;

  const timeStart = timeToMinutes(getTimeStart(timeRange));
  const timeEnd = timeToMinutes(getTimeEnd(timeRange));

  return getBusinessHoursForDate(date).some((period) => (
    timeStart >= timeToMinutes(period.start) && timeEnd <= timeToMinutes(period.end)
  ));
}

function isLunchBreakForDate(timeRange, date) {
  if (!date || date.getDay() < 1 || date.getDay() > 5) return false;

  const timeStart = timeToMinutes(getTimeStart(timeRange));
  const timeEnd = timeToMinutes(getTimeEnd(timeRange));

  return timeStart >= timeToMinutes("11:00") && timeEnd <= timeToMinutes("13:00");
}

function getBusinessUnavailableReasonForDate(timeRange, date) {
  if (!date || isDateClosed(date)) return "Fechado";
  if (isLunchBreakForDate(timeRange, date)) return "Intervalo";
  if (!isTimeInsideBusinessHoursForDate(timeRange, date)) return "Fora do horário";
  return "";
}

function getAvailableTimesForDate(isoDate) {
  const date = isoDate ? parseISODate(isoDate) : null;
  return availableTimes.filter((time) => isTimeInsideBusinessHoursForDate(time, date));
}

function getNextBookableDate(startDate = new Date()) {
  const date = new Date(startDate);
  date.setHours(0, 0, 0, 0);

  for (let index = 0; index < 370; index += 1) {
    if (date >= getTodayStart() && !isDateClosed(date)) return new Date(date);
    date.setDate(date.getDate() + 1);
  }

  return getTodayStart();
}

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isSameDay(firstDate, secondDate) {
  return toISODate(firstDate) === toISODate(secondDate);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function getWeekday(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
  }).format(date).replace(".", "");
}

function getMonthTitle(date) {
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(date)
  );
}

function getDayLabel(date) {
  const today = getTodayStart();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (isSameDay(date, today)) return "Hoje";
  if (isSameDay(date, tomorrow)) return "Amanhã";

  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
    }).format(date)
  );
}

function getTimeStart(timeRange) {
  return timeRange.split("-")[0].trim();
}

function parsePriceToNumber(price) {
  return Number(String(price).replace(/[^0-9,.-]/g, "").replace(".", "").replace(",", ".")) || 0;
}

// Fallback em memória: mantém o site funcionando mesmo quando o navegador bloqueia localStorage
// em prévias locais, modo privado ou alguns webviews.
let memoryBookingsCache = [];

function getStoredBookings() {
  try {
    const stored = JSON.parse(localStorage.getItem(BOOKINGS_STORAGE_KEY)) || [];
    memoryBookingsCache = Array.isArray(stored) ? stored : [];
    return memoryBookingsCache;
  } catch (error) {
    return memoryBookingsCache;
  }
}

function setStoredBookings(bookings) {
  memoryBookingsCache = Array.isArray(bookings) ? bookings : [];

  try {
    localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(memoryBookingsCache));
  } catch (error) {
    console.warn("Não foi possível salvar no localStorage. Os dados ficarão ativos apenas nesta sessão.", error);
  }
}

function generateBookingId() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DK-${datePart}-${randomPart}`;
}

function buildCurrentBookingRecord() {
  const professional = getSelectedProfessional();
  const service = getSelectedService();
  const day = getSelectedDay();

  return {
    id: state.bookingId || generateBookingId(),
    createdAt: new Date().toISOString(),
    bookingDateIso: state.dayIso,
    dateLabel: day?.label || "",
    dateFormatted: day?.date || "",
    time: state.time,
    professionalId: professional?.id || "",
    professionalName: professional?.name || "",
    serviceId: service?.id || "",
    serviceName: service?.name || "",
    serviceDuration: service?.duration || "",
    servicePrice: service?.price || "",
    servicePriceValue: parsePriceToNumber(service?.price || "0"),
    clientName: state.clientName.trim(),
    clientPhone: state.clientPhone,
    status: "Pendente",
    source: "Site",
    city: BARBERSHOP.city,
  };
}

function saveCurrentBooking() {
  if (state.bookingId) return state.bookingId;

  const record = buildCurrentBookingRecord();
  state.bookingId = record.id;

  const bookings = getStoredBookings();
  const alreadyExists = bookings.some((booking) => booking.id === record.id);

  if (!alreadyExists) {
    bookings.unshift(record);
    setStoredBookings(bookings);

    if (typeof window.refreshEmbeddedAdminPanel === "function") {
      window.refreshEmbeddedAdminPanel();
    }
  }

  return record.id;
}

function updateCurrentBookingStatus(status) {
  if (!state.bookingId) return;

  const bookings = getStoredBookings().map((booking) => (
    booking.id === state.bookingId
      ? { ...booking, status, updatedAt: new Date().toISOString() }
      : booking
  ));

  setStoredBookings(bookings);
}

const initialBookingDate = getNextBookableDate();

const state = {
  currentStep: 0,
  professionalId: "denner",
  serviceId: "pe-barba",
  calendarDate: getMonthStart(initialBookingDate),
  dayIso: toISODate(initialBookingDate),
  time: "07:30 - 08:00",
  clientName: "",
  clientPhone: "",
  bookingId: "",
};

const screens = document.querySelectorAll(".screen");
const progressFill = document.getElementById("progressFill");
const stepLabels = document.querySelectorAll(".step-label");
const professionalsList = document.getElementById("professionalsList");
const servicesList = document.getElementById("servicesList");
const daysList = document.getElementById("daysList");
const timesList = document.getElementById("timesList");
const backButton = document.getElementById("backButton");
const nextButton = document.getElementById("nextButton");
const footerActions = document.getElementById("footerActions");
const clientName = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const whatsappLink = document.getElementById("whatsappLink");
const cancelLink = document.getElementById("cancelLink");
const newBookingButton = document.getElementById("newBookingButton");
const scheduleSubtitle = document.getElementById("scheduleSubtitle");

function getSelectedProfessional() {
  return professionals.find((item) => item.id === state.professionalId);
}

function getSelectedService() {
  return services.find((item) => item.id === state.serviceId);
}

function isSelectedDayAvailable() {
  if (!state.dayIso) return false;
  const selectedDate = parseISODate(state.dayIso);
  return selectedDate >= getTodayStart() && !isDateClosed(selectedDate);
}

function getSelectedDay() {
  if (!state.dayIso) return null;

  const selectedDate = parseISODate(state.dayIso);

  return {
    id: state.dayIso,
    iso: state.dayIso,
    label: getDayLabel(selectedDate),
    weekday: getWeekday(selectedDate),
    date: formatDate(selectedDate),
    fullDate: selectedDate,
  };
}

function getFixedUnavailableTimesForSelectedDay() {
  const selectedDay = getSelectedDay();
  if (!selectedDay) return [];

  return fixedUnavailableTimesByWeekday[selectedDay.fullDate.getDay()] || [];
}

function isTimeBlockedByFixedClient(timeRange) {
  return getFixedUnavailableTimesForSelectedDay().includes(getTimeStart(timeRange));
}

function isTimeAlreadyBooked(timeRange) {
  if (!state.dayIso || !state.professionalId) return false;

  return getStoredBookings().some((booking) => (
    booking.bookingDateIso === state.dayIso &&
    booking.time === timeRange &&
    booking.professionalId === state.professionalId &&
    booking.status !== "Cancelado" &&
    booking.id !== state.bookingId
  ));
}

function getTimeUnavailableReason(timeRange) {
  const selectedDay = getSelectedDay();
  const businessUnavailableReason = getBusinessUnavailableReasonForDate(timeRange, selectedDay?.fullDate);

  if (businessUnavailableReason) return businessUnavailableReason;
  if (isTimeBlockedByFixedClient(timeRange)) return "Cliente fixo";
  if (isTimeAlreadyBooked(timeRange)) return "Ocupado";
  return "";
}

function isTimeUnavailable(timeRange) {
  return Boolean(getTimeUnavailableReason(timeRange));
}

function getFirstAvailableTimeForSelectedDay() {
  return availableTimes.find((time) => !isTimeUnavailable(time)) || "";
}

function ensureSelectedTimeIsAvailable() {
  if (!state.time || isTimeUnavailable(state.time)) {
    state.time = getFirstAvailableTimeForSelectedDay();
  }
}

// Regra de avanço automático:
// somente as duas primeiras telas do fluxo avançam ao clicar em uma opção.
// Tela 1 = state.currentStep 0 | Tela 2 = state.currentStep 1.
function shouldAutoAdvanceAfterOptionClick() {
  return state.currentStep === 0 || state.currentStep === 1;
}

function autoAdvanceAfterOptionClick() {
  if (!shouldAutoAdvanceAfterOptionClick() || !isCurrentStepValid()) return;

  state.currentStep += 1;
  window.scrollTo({ top: 0, behavior: "smooth" });
  updateUI();
}

function renderProfessionals() {
  professionalsList.innerHTML = professionals.map((item) => `
    <button type="button" class="option-card professional-card ${state.professionalId === item.id ? "selected" : ""}" data-professional-id="${item.id}">
      <span class="avatar">${item.initial}</span>
      <span class="option-main">
        <strong>${item.name}</strong>
        <small>${item.role}</small>
        <span class="option-note">${item.note}</span>
      </span>
      <span class="arrow">›</span>
    </button>
  `).join("");

  document.querySelectorAll("[data-professional-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.professionalId = button.dataset.professionalId;
      renderProfessionals();
      updateUI();
      autoAdvanceAfterOptionClick();
    });
  });
}

function renderServices() {
  servicesList.innerHTML = services.map((item) => `
    <button type="button" class="option-card service-card ${state.serviceId === item.id ? "selected" : ""}" data-service-id="${item.id}">
      <span class="service-left">
        <span class="service-photo-frame" style="--service-photo: url('${item.image}')" aria-hidden="true">
          <img src="${item.image}" alt="" loading="lazy" />
        </span>
        <span class="option-main">
          <strong>${item.name}</strong>
          <small>${item.duration} de atendimento</small>
        </span>
      </span>
      <span class="price">${item.price}</span>
    </button>
  `).join("");

  document.querySelectorAll("[data-service-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.serviceId = button.dataset.serviceId;
      renderServices();
      updateUI();
      autoAdvanceAfterOptionClick();
    });
  });
}

function getCalendarCells() {
  const monthStart = getMonthStart(state.calendarDate);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekDay = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekDay + daysInMonth) / 7) * 7;
  const today = getTodayStart();

  return Array.from({ length: totalCells }).map((_, index) => {
    const calendarDay = index - firstWeekDay + 1;
    const date = new Date(year, month, calendarDay);
    date.setHours(0, 0, 0, 0);

    const isOutsideMonth = date.getMonth() !== month;
    const isPast = date < today;
    const isClosed = isDateClosed(date);
    const isoDate = toISODate(date);

    return {
      date,
      isoDate,
      dayNumber: date.getDate(),
      isOutsideMonth,
      isPast,
      isClosed,
      isToday: isSameDay(date, today),
      isSelected: state.dayIso === isoDate,
      isDisabled: isOutsideMonth || isPast || isClosed,
    };
  });
}

function renderDays() {
  const monthStart = getMonthStart(state.calendarDate);
  const previousMonthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 0);
  previousMonthEnd.setHours(0, 0, 0, 0);
  const canGoPrevious = previousMonthEnd >= getTodayStart();
  const selectedDay = getSelectedDay();
  const calendarCells = getCalendarCells();

  daysList.innerHTML = `
    <div class="calendar-widget" aria-label="Calendário de agendamento">
      <div class="calendar-topbar">
        <button type="button" class="calendar-nav-button" data-calendar-nav="prev" ${canGoPrevious ? "" : "disabled"} aria-label="Mês anterior">‹</button>
        <div class="calendar-title-wrap">
          <strong>${getMonthTitle(monthStart)}</strong>
          <span>Dias anteriores e domingos ficam bloqueados automaticamente</span>
        </div>
        <button type="button" class="calendar-nav-button" data-calendar-nav="next" aria-label="Próximo mês">›</button>
      </div>

      <div class="calendar-weekdays" aria-hidden="true">
        ${weekDays.map((day) => `<span>${day}</span>`).join("")}
      </div>

      <div class="calendar-month-grid">
        ${calendarCells.map((item) => `
          <button
            type="button"
            class="calendar-day ${item.isSelected ? "selected" : ""} ${item.isToday ? "is-today" : ""} ${item.isPast ? "is-past" : ""} ${item.isClosed ? "is-closed" : ""} ${item.isOutsideMonth ? "is-outside" : ""}"
            data-date="${item.isoDate}"
            ${item.isDisabled ? "disabled" : ""}
            aria-label="${item.isClosed ? "Fechado" : item.isDisabled ? "Indisponível" : "Selecionar"} ${formatDate(item.date)}"
          >
            <span class="calendar-day-number">${item.dayNumber}</span>
            ${item.isClosed ? `<small>Fechado</small>` : item.isToday ? `<small>Hoje</small>` : ""}
          </button>
        `).join("")}
      </div>

      <div class="calendar-selected-line">
        <span>Selecionado</span>
        <strong>${selectedDay ? `${selectedDay.label}, ${selectedDay.date}` : "Escolha uma data"}</strong>
      </div>
    </div>
  `;

  document.querySelectorAll("[data-calendar-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.calendarNav === "next" ? 1 : -1;
      state.calendarDate = getMonthStart(new Date(
        state.calendarDate.getFullYear(),
        state.calendarDate.getMonth() + direction,
        1
      ));
      renderDays();
    });
  });

  document.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;

      state.dayIso = button.dataset.date;
      ensureSelectedTimeIsAvailable();
      renderDays();
      renderTimes();
      updateUI();
    });
  });
}

function renderTimes() {
  ensureSelectedTimeIsAvailable();

  timesList.innerHTML = availableTimes.map((time) => {
    const unavailableReason = getTimeUnavailableReason(time);
    const unavailable = Boolean(unavailableReason);
    return `
      <button
        type="button"
        class="time-button ${state.time === time ? "selected" : ""} ${unavailable ? "unavailable" : ""}"
        data-time="${time}"
        ${unavailable ? "disabled" : ""}
        aria-label="${unavailable ? "Horário indisponível" : "Selecionar horário"} ${time}"
      >
        <span>${time}</span>
        ${unavailable ? `<small>${unavailableReason}</small>` : ""}
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-time]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;

      state.time = button.dataset.time;
      renderTimes();
      updateUI();
    });
  });
}

function isCurrentStepValid() {
  if (state.currentStep === 0) return Boolean(state.professionalId);
  if (state.currentStep === 1) return Boolean(state.serviceId);
  if (state.currentStep === 2) return Boolean(state.dayIso && isSelectedDayAvailable() && state.time && !isTimeUnavailable(state.time));
  if (state.currentStep === 3) {
    const nameOk = state.clientName.trim().length >= 3;
    const phoneDigits = state.clientPhone.replace(/\D/g, "");
    const phoneOk = phoneDigits.length >= 10;
    return nameOk && phoneOk;
  }
  return true;
}

function updateSummary() {
  const professional = getSelectedProfessional();
  const service = getSelectedService();
  const day = getSelectedDay();

  document.getElementById("summaryProfessional").textContent = professional ? `Profissional: ${professional.name}` : "";
  document.getElementById("summaryService").textContent = service ? `Serviço: ${service.name} · ${service.price}` : "";
  document.getElementById("summaryDate").textContent = day ? `Data: ${day.label}, ${day.date} às ${state.time}` : "";

  document.getElementById("finalProfessional").textContent = professional ? `Profissional: ${professional.name}` : "";
  document.getElementById("finalService").textContent = service ? `Serviço: ${service.name} · ${service.price}` : "";
  document.getElementById("finalDate").textContent = day ? `Data: ${day.label}, ${day.date} às ${state.time}` : "";
  document.getElementById("finalClient").textContent = `Cliente: ${state.clientName} · ${state.clientPhone}`;

  if (professional) {
    scheduleSubtitle.textContent = `Escolha uma data disponível no calendário para ${professional.name}.`;
  }
}

function buildBookingWhatsAppUrl() {
  const professional = getSelectedProfessional();
  const service = getSelectedService();
  const day = getSelectedDay();
  const cancelUrl = buildCancelWhatsAppUrl();
  const bookingId = state.bookingId || "Será gerado ao finalizar";

  const message = encodeURIComponent(
    `Olá, DK Barber Club! Tudo bem?

` +
    `Acabei de realizar um agendamento pelo site e gostaria de confirmar minha reserva.

` +
    `📅 Dados do agendamento
` +
    `Código da reserva: ${bookingId}
` +
    `Profissional: ${professional?.name || ""}
` +
    `Serviço: ${service?.name || ""}
` +
    `Valor: ${service?.price || ""}
` +
    `Data: ${day?.label || ""} - ${day?.date || ""}
` +
    `Horário: ${state.time}

` +
    `👤 Dados do cliente
` +
    `Nome: ${state.clientName}
` +
    `WhatsApp: ${state.clientPhone}

` +
    `Status: aguardando confirmação da barbearia.

` +
    `Caso eu precise cancelar este agendamento, posso usar o link abaixo:
` +
    `${cancelUrl}

` +
    `Obrigado!`
  );

  return `https://wa.me/${BARBERSHOP.whatsappNumber}?text=${message}`;
}

function buildCancelWhatsAppUrl() {
  const professional = getSelectedProfessional();
  const service = getSelectedService();
  const day = getSelectedDay();
  const bookingId = state.bookingId || "Não informado";

  const message = encodeURIComponent(
    `Olá, DK Barber Club! Tudo bem?

` +
    `Gostaria de solicitar o cancelamento do meu agendamento.

` +
    `📅 Dados do agendamento
` +
    `Código da reserva: ${bookingId}
` +
    `Profissional: ${professional?.name || ""}
` +
    `Serviço: ${service?.name || ""}
` +
    `Valor: ${service?.price || ""}
` +
    `Data: ${day?.label || ""} - ${day?.date || ""}
` +
    `Horário: ${state.time}

` +
    `👤 Dados do cliente
` +
    `Nome: ${state.clientName}
` +
    `WhatsApp: ${state.clientPhone}

` +
    `Status: cancelamento solicitado pelo cliente.

` +
    `Obrigado pela atenção.`
  );

  return `https://wa.me/${BARBERSHOP.whatsappNumber}?text=${message}`;
}

function updateWhatsAppLinks() {
  whatsappLink.href = buildBookingWhatsAppUrl();
  cancelLink.href = buildCancelWhatsAppUrl();
}

function notifyBarbershopOnFinish() {
  updateWhatsAppLinks();

  // Importante: o navegador/WhatsApp não permite envio 100% automático.
  // Ao finalizar, o sistema abre a conversa da barbearia com a mensagem pronta.
  // A pessoa só precisa tocar em "Enviar" no WhatsApp.
  const whatsappWindow = window.open(whatsappLink.href, "_blank", "noopener");

  if (!whatsappWindow) {
    whatsappLink.focus();
  }
}

function updateUI() {
  screens.forEach((screen) => {
    screen.classList.toggle("active", Number(screen.dataset.screen) === state.currentStep);
  });

  stepLabels.forEach((label) => {
    const step = Number(label.dataset.stepLabel);
    label.classList.toggle("active", step === state.currentStep);
    label.classList.toggle("done", step < state.currentStep);
  });

  progressFill.style.width = `${((Math.min(state.currentStep, 3) + 1) / 4) * 100}%`;
  backButton.classList.toggle("hidden", state.currentStep === 0);

  // Botão "Continuar" removido visualmente apenas nas telas 1 e 2.
  // Como essas telas avançam automaticamente ao selecionar uma opção, o botão não aparece nelas.
  // A partir da tela 3, o botão volta a aparecer e o fluxo continua exigindo clique manual.
  nextButton.style.display = state.currentStep === 0 || state.currentStep === 1 ? "none" : "";
  nextButton.disabled = !isCurrentStepValid();
  nextButton.innerHTML = state.currentStep === 3 ? "Finalizar agendamento <span>›</span>" : "Continuar <span>›</span>";
  footerActions.style.display = state.currentStep === 4 ? "none" : "block";

  updateSummary();
  updateWhatsAppLinks();
}

function goNext() {
  if (!isCurrentStepValid()) {
    const activeScreen = document.querySelector(".screen.active");
    activeScreen.classList.remove("error-shake");
    void activeScreen.offsetWidth;
    activeScreen.classList.add("error-shake");
    return;
  }

  if (state.currentStep < 3) {
    state.currentStep += 1;
    window.scrollTo({ top: 0, behavior: "smooth" });
    updateUI();
    return;
  }

  saveCurrentBooking();
  state.currentStep = 4;
  window.scrollTo({ top: 0, behavior: "smooth" });
  updateUI();
  notifyBarbershopOnFinish();
}

function goBack() {
  // Funcionamento do botão "Voltar" preservado:
  // ele sempre reduz uma etapa e não chama a regra de avanço automático.
  // Assim, voltar para a tela 1 ou 2 não força o usuário a avançar novamente sem clicar em uma opção.
  if (state.currentStep > 0) {
    state.currentStep -= 1;
    updateUI();
  }
}

function resetBooking() {
  state.currentStep = 0;
  state.professionalId = "denner";
  state.serviceId = "pe-barba";
  const nextBookableDate = getNextBookableDate();
  state.calendarDate = getMonthStart(nextBookableDate);
  state.dayIso = toISODate(nextBookableDate);
  state.time = "07:30 - 08:00";
  ensureSelectedTimeIsAvailable();
  state.clientName = "";
  state.clientPhone = "";
  state.bookingId = "";
  clientName.value = "";
  clientPhone.value = "";
  renderProfessionals();
  renderServices();
  renderDays();
  renderTimes();
  updateUI();
}

clientName.addEventListener("input", (event) => {
  state.clientName = event.target.value;
  updateUI();
});

clientPhone.addEventListener("input", (event) => {
  let value = event.target.value.replace(/\D/g, "").slice(0, 11);

  if (value.length > 10) {
    value = value.replace(/^(\d{2})(\d{1})(\d{4})(\d{4}).*/, "($1) $2 $3-$4");
  } else if (value.length > 6) {
    value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
  } else if (value.length > 2) {
    value = value.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  } else if (value.length > 0) {
    value = value.replace(/^(\d*)/, "($1");
  }

  event.target.value = value;
  state.clientPhone = value;
  updateUI();
});

nextButton.addEventListener("click", goNext);
backButton.addEventListener("click", goBack);
newBookingButton.addEventListener("click", resetBooking);

cancelLink.addEventListener("click", () => {
  updateCurrentBookingStatus("Cancelado");
});

renderProfessionals();
renderServices();
renderDays();
renderTimes();
updateUI();

// Abertura robusta do painel administrativo.
// Mantém o painel funcionando mesmo se algum navegador bloquear o evento do menu suspenso.
function activateEmbeddedAdminTab(adminOverlay, tab = "bookings") {
  if (!adminOverlay) return;

  const targetTab = tab || "bookings";
  adminOverlay.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminTab === targetTab);
  });
  adminOverlay.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.adminPanel === targetTab);
  });
}

function openEmbeddedAdminPanelFallback(tab = "bookings") {
  const adminOverlay = document.getElementById("embeddedAdminPanel");
  const moreMenuDropdown = document.getElementById("moreMenuDropdown");
  const moreMenuButton = document.getElementById("moreMenuButton");

  if (moreMenuDropdown) moreMenuDropdown.hidden = true;
  if (moreMenuButton) moreMenuButton.setAttribute("aria-expanded", "false");

  if (!adminOverlay) return;

  adminOverlay.classList.add("open");
  adminOverlay.style.display = "block";
  adminOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-open");
  activateEmbeddedAdminTab(adminOverlay, tab);

  if (typeof window.refreshEmbeddedAdminPanel === "function") {
    window.refreshEmbeddedAdminPanel();
  }

  setTimeout(() => {
    adminOverlay.scrollTo({ top: 0, behavior: "smooth" });
  }, 0);
}

function closeEmbeddedAdminPanelFallback() {
  const adminOverlay = document.getElementById("embeddedAdminPanel");
  if (!adminOverlay) return;

  adminOverlay.classList.remove("open");
  adminOverlay.style.display = "";
  adminOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-open");
}

window.openEmbeddedAdminPanel = (tab = "bookings") => requestAdminAccess(tab, openEmbeddedAdminPanelFallback);
window.closeEmbeddedAdminPanel = closeEmbeddedAdminPanelFallback;

// Painel administrativo embutido na agenda.
function initEmbeddedAdminPanel() {
  const adminOverlay = document.getElementById("embeddedAdminPanel");
  const moreMenuButton = document.getElementById("moreMenuButton");
  const moreMenuDropdown = document.getElementById("moreMenuDropdown");
  const openAdminButton = document.getElementById("openAdminButton");
  const closeAdminButton = document.getElementById("closeAdminButton");
  const logoutAdminButton = document.getElementById("logoutAdminButton");

  if (!adminOverlay || !moreMenuButton || !moreMenuDropdown || !openAdminButton) return false;

  const statusOptions = ["Pendente", "Confirmado", "Concluído", "Cancelado"];

  const adminState = {
    bookings: [],
    currentTab: "dashboard",
    filters: {
      search: "",
      status: "all",
      start: "",
      end: "",
    },
    report: {
      period: "daily",
      date: adminTodayIso(),
    },
  };

  const $ = (selector) => adminOverlay.querySelector(selector);
  const $$ = (selector) => adminOverlay.querySelectorAll(selector);

  const tabs = $$('[data-admin-tab]');
  const panels = $$('[data-admin-panel]');
  const todayRevenue = $("#todayRevenue");
  const todayCount = $("#todayCount");
  const todayCountHelp = $("#todayCountHelp");
  const weekRevenue = $("#weekRevenue");
  const weekCountHelp = $("#weekCountHelp");
  const monthRevenue = $("#monthRevenue");
  const monthCountHelp = $("#monthCountHelp");
  const todayBookingsList = $("#todayBookingsList");
  const dashboardServiceRanking = $("#dashboardServiceRanking");
  const bookingsTableBody = $("#bookingsTableBody");
  const mobileBookingsList = $("#mobileBookingsList");
  const emptyBookingsState = $("#emptyBookingsState");
  const bookingSearch = $("#bookingSearch");
  const statusFilter = $("#statusFilter");
  const dateStartFilter = $("#dateStartFilter");
  const dateEndFilter = $("#dateEndFilter");
  const reportPeriod = $("#reportPeriod");
  const reportDate = $("#reportDate");
  const reportRangeText = $("#reportRangeText");
  const reportRevenue = $("#reportRevenue");
  const reportCount = $("#reportCount");
  const reportCountHelp = $("#reportCountHelp");
  const reportAverageTicket = $("#reportAverageTicket");
  const reportCanceled = $("#reportCanceled");
  const periodSummaryCards = $("#periodSummaryCards");
  const serviceReportList = $("#serviceReportList");
  const professionalReportList = $("#professionalReportList");
  const exportAllButton = $("#exportAllButton");
  const exportReportButton = $("#exportReportButton");
  const manualBookingForm = $("#manualBookingForm");
  const manualClientName = $("#manualClientName");
  const manualClientPhone = $("#manualClientPhone");
  const manualProfessional = $("#manualProfessional");
  const manualService = $("#manualService");
  const manualDate = $("#manualDate");
  const manualTime = $("#manualTime");
  const manualStatus = $("#manualStatus");

  function adminTodayIso() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function adminParseIsoDate(isoDate) {
    const [year, month, day] = String(isoDate || adminTodayIso()).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function adminFormatDateBR(isoDate) {
    if (!isoDate) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(adminParseIsoDate(isoDate));
  }

  function adminFormatDateShort(isoDate) {
    if (!isoDate) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(adminParseIsoDate(isoDate));
  }

  function adminFormatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value) || 0);
  }

  function normalizePhoneForWhatsApp(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("55")) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  function getBookingDateTime(booking) {
    const timeStart = getTimeStart(booking.time) || "00:00";
    return new Date(`${booking.bookingDateIso || adminTodayIso()}T${timeStart}:00`);
  }

  function normalizeAdminBooking(booking) {
    const serviceFromCatalog = services.find((service) => service.id === booking.serviceId || service.name === booking.serviceName);
    const professionalFromCatalog = professionals.find((professional) => professional.id === booking.professionalId || professional.name === booking.professionalName);
    const servicePriceValue = Number(booking.servicePriceValue) || parsePriceToNumber(booking.servicePrice) || parsePriceToNumber(serviceFromCatalog?.price || "0");

    return {
      id: booking.id || generateBookingId(),
      createdAt: booking.createdAt || new Date().toISOString(),
      updatedAt: booking.updatedAt || "",
      bookingDateIso: booking.bookingDateIso || adminTodayIso(),
      dateLabel: booking.dateLabel || "",
      dateFormatted: booking.dateFormatted || adminFormatDateShort(booking.bookingDateIso || adminTodayIso()),
      time: booking.time || "07:30 - 08:00",
      professionalId: booking.professionalId || professionalFromCatalog?.id || "",
      professionalName: booking.professionalName || professionalFromCatalog?.name || "Profissional não informado",
      serviceId: booking.serviceId || serviceFromCatalog?.id || "",
      serviceName: booking.serviceName || serviceFromCatalog?.name || "Serviço não informado",
      serviceDuration: booking.serviceDuration || serviceFromCatalog?.duration || "",
      servicePrice: booking.servicePrice || serviceFromCatalog?.price || adminFormatCurrency(servicePriceValue),
      servicePriceValue,
      clientName: booking.clientName || "Cliente não informado",
      clientPhone: booking.clientPhone || "",
      status: statusOptions.includes(booking.status) ? booking.status : "Pendente",
      source: booking.source || "Site",
      city: booking.city || BARBERSHOP.city,
    };
  }

  function loadAdminBookings() {
    return getStoredBookings().map(normalizeAdminBooking).sort((a, b) => getBookingDateTime(a) - getBookingDateTime(b));
  }

  function saveAdminBookings() {
    setStoredBookings(adminState.bookings);
  }

  function isValidRevenueBooking(booking) {
    return booking.status === "Concluído";
  }

  function getFilteredBookings() {
    const search = adminState.filters.search.trim().toLowerCase();

    return adminState.bookings.filter((booking) => {
      const matchesSearch = !search || [
        booking.clientName,
        booking.clientPhone,
        booking.serviceName,
        booking.professionalName,
        booking.id,
        booking.status,
      ].join(" ").toLowerCase().includes(search);

      const matchesStatus = adminState.filters.status === "all" || booking.status === adminState.filters.status;
      const matchesStart = !adminState.filters.start || booking.bookingDateIso >= adminState.filters.start;
      const matchesEnd = !adminState.filters.end || booking.bookingDateIso <= adminState.filters.end;

      return matchesSearch && matchesStatus && matchesStart && matchesEnd;
    }).sort((a, b) => getBookingDateTime(a) - getBookingDateTime(b));
  }

  function getPeriodRange(period, anchorIso) {
    const anchor = adminParseIsoDate(anchorIso || adminTodayIso());
    let start = new Date(anchor);
    let end = new Date(anchor);

    if (period === "weekly") {
      const mondayOffset = (anchor.getDay() + 6) % 7;
      start.setDate(anchor.getDate() - mondayOffset);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    }

    if (period === "monthly") {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    }

    const toIso = (date) => {
      const copy = new Date(date);
      copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
      return copy.toISOString().slice(0, 10);
    };

    return {
      startIso: toIso(start),
      endIso: toIso(end),
      label: `${adminFormatDateBR(toIso(start))} a ${adminFormatDateBR(toIso(end))}`,
    };
  }

  function getBookingsInRange(startIso, endIso, includeCanceled = true) {
    return adminState.bookings.filter((booking) => {
      const inRange = booking.bookingDateIso >= startIso && booking.bookingDateIso <= endIso;
      if (!inRange) return false;
      return includeCanceled || isValidRevenueBooking(booking);
    });
  }

  function summarizeBookings(bookings) {
    const validBookings = bookings.filter(isValidRevenueBooking);
    const revenue = validBookings.reduce((sum, booking) => sum + (Number(booking.servicePriceValue) || 0), 0);
    const count = validBookings.length;

    return {
      revenue,
      count,
      averageTicket: count ? revenue / count : 0,
      canceled: bookings.filter((booking) => booking.status === "Cancelado").length,
    };
  }

  function formatDoneServices(count) {
    return count === 1 ? "1 corte/serviço feito" : `${count} cortes/serviços feitos`;
  }

  function getPeriodTitle(period) {
    if (period === "daily") return "Diário";
    if (period === "weekly") return "Semanal";
    return "Mensal";
  }

  function getPeriodSummaryItems(anchorIso = adminTodayIso()) {
    return ["daily", "weekly", "monthly"].map((period) => {
      const range = getPeriodRange(period, anchorIso);
      const bookings = getBookingsInRange(range.startIso, range.endIso, true);
      const summary = summarizeBookings(bookings);

      return {
        period,
        title: getPeriodTitle(period),
        range,
        summary,
      };
    });
  }

  function groupBookings(bookings, keyGetter) {
    const validBookings = bookings.filter(isValidRevenueBooking);
    const map = new Map();

    validBookings.forEach((booking) => {
      const key = keyGetter(booking) || "Não informado";
      const current = map.get(key) || { name: key, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(booking.servicePriceValue) || 0;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  }

  function statusClass(status) {
    return `status-${String(status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;
  }

  function statusPill(status) {
    return `<span class="status-pill ${statusClass(status)}">${status}</span>`;
  }

  function createStatusSelect(booking) {
    return `
      <select class="status-select" data-admin-action="status" data-id="${booking.id}" aria-label="Alterar status">
        ${statusOptions.map((status) => `<option value="${status}" ${booking.status === status ? "selected" : ""}>${status}</option>`).join("")}
      </select>
    `;
  }

  function createActions(booking) {
    const phone = normalizePhoneForWhatsApp(booking.clientPhone);
    const whatsappHref = phone ? `https://wa.me/${phone}` : "#";

    return `
      <div class="actions-cell">
        <a class="action-button" href="${whatsappHref}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="action-button danger" type="button" data-admin-action="delete" data-id="${booking.id}">Excluir</button>
      </div>
    `;
  }

  function renderDashboard() {
    const today = adminTodayIso();
    const weekRange = getPeriodRange("weekly", today);
    const monthRange = getPeriodRange("monthly", today);
    const todayBookings = getBookingsInRange(today, today, true);
    const weekBookings = getBookingsInRange(weekRange.startIso, weekRange.endIso, true);
    const monthBookings = getBookingsInRange(monthRange.startIso, monthRange.endIso, true);

    const todaySummary = summarizeBookings(todayBookings);
    const weekSummary = summarizeBookings(weekBookings);
    const monthSummary = summarizeBookings(monthBookings);

    todayRevenue.textContent = adminFormatCurrency(todaySummary.revenue);
    todayCount.textContent = todaySummary.count;
    todayCountHelp.textContent = formatDoneServices(todaySummary.count);
    weekRevenue.textContent = adminFormatCurrency(weekSummary.revenue);
    weekCountHelp.textContent = formatDoneServices(weekSummary.count);
    monthRevenue.textContent = adminFormatCurrency(monthSummary.revenue);
    monthCountHelp.textContent = formatDoneServices(monthSummary.count);

    const upcomingToday = todayBookings
      .filter((booking) => booking.status !== "Cancelado")
      .sort((a, b) => getBookingDateTime(a) - getBookingDateTime(b));

    todayBookingsList.innerHTML = upcomingToday.length
      ? upcomingToday.map((booking) => `
        <div class="booking-item">
          <div>
            <strong>${booking.time}</strong>
            <span>${booking.clientName} · ${booking.serviceName}</span>
          </div>
          ${statusPill(booking.status)}
        </div>
      `).join("")
      : `<div class="empty-state" style="display:block"><strong>Nenhum horário para hoje.</strong><p>Os agendamentos do dia aparecerão aqui.</p></div>`;

    const ranking = groupBookings(monthBookings, (booking) => booking.serviceName);
    renderRanking(dashboardServiceRanking, ranking, monthSummary.revenue);
  }

  function renderRanking(container, ranking, totalRevenue) {
    if (!ranking.length) {
      container.innerHTML = `<div class="empty-state" style="display:block"><strong>Sem serviços concluídos.</strong><p>Marque os atendimentos como Concluído para aparecerem aqui.</p></div>`;
      return;
    }

    container.innerHTML = ranking.map((item) => {
      const percent = totalRevenue ? Math.max(6, (item.revenue / totalRevenue) * 100) : 0;
      return `
        <div class="ranking-item" style="--bar-width:${percent}%">
          <div class="ranking-bar"></div>
          <div class="ranking-row">
            <div>
              <strong>${item.name}</strong>
              <span>${item.count} serviço${item.count > 1 ? "s" : ""}</span>
            </div>
            <strong>${adminFormatCurrency(item.revenue)}</strong>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderBookings() {
    const bookings = getFilteredBookings();
    emptyBookingsState.style.display = bookings.length ? "none" : "block";

    bookingsTableBody.innerHTML = bookings.map((booking) => `
      <tr>
        <td>
          <span class="table-main-text">${adminFormatDateBR(booking.bookingDateIso)}</span>
          <span class="table-sub-text">${booking.time} · ${booking.id}</span>
        </td>
        <td>
          <a class="table-main-text client-link" href="https://wa.me/${normalizePhoneForWhatsApp(booking.clientPhone)}" target="_blank" rel="noopener">${booking.clientName}</a>
          <span class="table-sub-text">${booking.clientPhone || "Telefone não informado"}</span>
        </td>
        <td>
          <span class="table-main-text">${booking.serviceName}</span>
          <span class="table-sub-text">${booking.serviceDuration || "Duração não informada"}</span>
        </td>
        <td>${booking.professionalName}</td>
        <td><span class="table-main-text">${adminFormatCurrency(booking.servicePriceValue)}</span></td>
        <td>${createStatusSelect(booking)}</td>
        <td>${createActions(booking)}</td>
      </tr>
    `).join("");

    mobileBookingsList.innerHTML = bookings.map((booking) => `
      <article class="mobile-booking-card">
        <div class="mobile-card-top">
          <div>
            <strong>${booking.clientName}</strong>
            <span class="table-sub-text">${booking.clientPhone || "Telefone não informado"}</span>
          </div>
          ${statusPill(booking.status)}
        </div>
        <div class="mobile-meta">
          <span><strong>Data:</strong> ${adminFormatDateBR(booking.bookingDateIso)} · ${booking.time}</span>
          <span><strong>Serviço:</strong> ${booking.serviceName} · ${adminFormatCurrency(booking.servicePriceValue)}</span>
          <span><strong>Profissional:</strong> ${booking.professionalName}</span>
          <span><strong>Código:</strong> ${booking.id}</span>
        </div>
        ${createStatusSelect(booking)}
        ${createActions(booking)}
      </article>
    `).join("");
  }

  function renderReports() {
    const range = getPeriodRange(adminState.report.period, adminState.report.date);
    const periodBookings = getBookingsInRange(range.startIso, range.endIso, true);
    const summary = summarizeBookings(periodBookings);

    renderPeriodSummaryCards();
    reportRangeText.textContent = `Período selecionado: ${range.label}`;
    reportRevenue.textContent = adminFormatCurrency(summary.revenue);
    reportCount.textContent = summary.count;
    reportCountHelp.textContent = formatDoneServices(summary.count);
    reportAverageTicket.textContent = adminFormatCurrency(summary.averageTicket);
    reportCanceled.textContent = summary.canceled;

    renderReportList(serviceReportList, groupBookings(periodBookings, (booking) => booking.serviceName), summary.revenue, "serviço");
    renderReportList(professionalReportList, groupBookings(periodBookings, (booking) => booking.professionalName), summary.revenue, "atendimento");
  }

  function renderPeriodSummaryCards() {
    if (!periodSummaryCards) return;

    periodSummaryCards.innerHTML = getPeriodSummaryItems(adminState.report.date).map((item) => `
      <button
        type="button"
        class="period-summary-card ${item.period === adminState.report.period ? "active" : ""}"
        data-period-card="${item.period}"
        aria-label="Ver relatório ${item.title.toLowerCase()}"
      >
        <span>${item.title}</span>
        <strong>${adminFormatCurrency(item.summary.revenue)}</strong>
        <small>${formatDoneServices(item.summary.count)}</small>
        <em>${item.range.label}</em>
      </button>
    `).join("");
  }

  function renderReportList(container, items, totalRevenue, label) {
    if (!items.length) {
      container.innerHTML = `<div class="empty-state" style="display:block"><strong>Sem serviços concluídos.</strong><p>Os dados aparecerão quando houver atendimentos com status Concluído.</p></div>`;
      return;
    }

    container.innerHTML = items.map((item) => {
      const percent = totalRevenue ? Math.max(6, (item.revenue / totalRevenue) * 100) : 0;
      return `
        <div class="report-item" style="--bar-width:${percent}%">
          <div class="report-bar"></div>
          <div class="report-row">
            <div>
              <strong>${item.name}</strong>
              <span>${item.count} ${label}${item.count > 1 ? "s" : ""}</span>
            </div>
            <strong>${adminFormatCurrency(item.revenue)}</strong>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAdmin() {
    renderDashboard();
    renderBookings();
    renderReports();
  }

  function setActiveAdminTab(tab) {
    const targetTab = Array.from(tabs).some((button) => button.dataset.adminTab === tab) ? tab : "bookings";
    adminState.currentTab = targetTab;
    tabs.forEach((button) => button.classList.toggle("active", button.dataset.adminTab === targetTab));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.adminPanel === targetTab));
    adminOverlay.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateBookingStatus(id, status) {
    adminState.bookings = adminState.bookings.map((booking) => (
      booking.id === id ? { ...booking, status, updatedAt: new Date().toISOString() } : booking
    ));
    saveAdminBookings();
    renderAdmin();
    renderTimes();
  }

  function deleteBooking(id) {
    const booking = adminState.bookings.find((item) => item.id === id);
    const label = booking ? `${booking.clientName} - ${adminFormatDateBR(booking.bookingDateIso)} ${booking.time}` : "este agendamento";
    if (!confirm(`Deseja excluir ${label}?`)) return;

    adminState.bookings = adminState.bookings.filter((booking) => booking.id !== id);
    saveAdminBookings();
    renderAdmin();
    renderTimes();
  }

  function updateManualTimeOptions() {
    const times = getAvailableTimesForDate(manualDate.value);

    manualTime.innerHTML = times.length
      ? times.map((time) => `<option value="${time}">${time}</option>`).join("")
      : `<option value="">Sem horários disponíveis</option>`;

    manualTime.disabled = !times.length;
  }

  function populateManualForm() {
    manualProfessional.innerHTML = professionals.map((professional) => `<option value="${professional.id}">${professional.name}</option>`).join("");
    manualService.innerHTML = services.map((service) => `<option value="${service.id}">${service.name} · ${service.price}</option>`).join("");
    manualDate.value = toISODate(getNextBookableDate(adminParseIsoDate(adminTodayIso())));
    updateManualTimeOptions();
    reportDate.value = adminState.report.date;
  }

  function addManualBooking(event) {
    event.preventDefault();

    const service = services.find((item) => item.id === manualService.value);
    const professional = professionals.find((item) => item.id === manualProfessional.value);
    const bookingDateIso = manualDate.value || adminTodayIso();

    if (!manualTime.value) {
      alert("Escolha um horário dentro do funcionamento da barbearia.");
      return;
    }

    const booking = normalizeAdminBooking({
      id: generateBookingId(),
      createdAt: new Date().toISOString(),
      bookingDateIso,
      dateLabel: "Manual",
      dateFormatted: adminFormatDateShort(bookingDateIso),
      time: manualTime.value,
      professionalId: professional?.id,
      professionalName: professional?.name,
      serviceId: service?.id,
      serviceName: service?.name,
      serviceDuration: service?.duration,
      servicePrice: service?.price,
      servicePriceValue: parsePriceToNumber(service?.price || "0"),
      clientName: manualClientName.value.trim(),
      clientPhone: manualClientPhone.value.trim(),
      status: manualStatus.value,
      source: "Manual",
      city: BARBERSHOP.city,
    });

    adminState.bookings = [booking, ...adminState.bookings].sort((a, b) => getBookingDateTime(a) - getBookingDateTime(b));
    saveAdminBookings();
    manualBookingForm.reset();
    populateManualForm();
    renderAdmin();
    renderTimes();
    setActiveAdminTab("bookings");
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map((cell) => {
      const value = String(cell ?? "").replace(/"/g, '""');
      return `"${value}"`;
    }).join(";")).join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportBookingsCsv(bookings, filename) {
    const rows = [
      ["Código", "Data", "Horário", "Cliente", "WhatsApp", "Serviço", "Profissional", "Valor", "Status", "Origem", "Criado em"],
      ...bookings.map((booking) => [
        booking.id,
        adminFormatDateBR(booking.bookingDateIso),
        booking.time,
        booking.clientName,
        booking.clientPhone,
        booking.serviceName,
        booking.professionalName,
        adminFormatCurrency(booking.servicePriceValue),
        booking.status,
        booking.source,
        booking.createdAt ? new Date(booking.createdAt).toLocaleString("pt-BR") : "",
      ]),
    ];

    downloadCsv(filename, rows);
  }

  function exportCurrentReportCsv() {
    const range = getPeriodRange(adminState.report.period, adminState.report.date);
    const bookings = getBookingsInRange(range.startIso, range.endIso, true);
    const periodLabel = adminState.report.period === "daily" ? "diario" : adminState.report.period === "weekly" ? "semanal" : "mensal";
    exportBookingsCsv(bookings, `relatorio-dk-barber-${periodLabel}-${range.startIso}-a-${range.endIso}.csv`);
  }

  function handleAdminActions(event) {
    const target = event.target;
    const id = target.dataset.id;
    const action = target.dataset.adminAction;

    if (!id || !action) return;

    if (action === "status") {
      updateBookingStatus(id, target.value);
    }

    if (action === "delete") {
      deleteBooking(id);
    }
  }

  function openAdminPanel(tab = "bookings") {
    closeMoreMenu();
    adminState.bookings = loadAdminBookings();
    adminOverlay.classList.add("open");
    adminOverlay.style.display = "block";
    adminOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-open");
    renderAdmin();
    setActiveAdminTab(tab);
    setTimeout(() => {
      adminOverlay.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  }

  function closeAdminPanel() {
    adminOverlay.classList.remove("open");
    adminOverlay.style.display = "";
    adminOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-open");
  }

  function openMoreMenu() {
    moreMenuDropdown.hidden = false;
    moreMenuButton.setAttribute("aria-expanded", "true");
  }

  function closeMoreMenu() {
    moreMenuDropdown.hidden = true;
    moreMenuButton.setAttribute("aria-expanded", "false");
  }

  function toggleMoreMenu(event) {
    event.stopPropagation();
    if (moreMenuDropdown.hidden) {
      openMoreMenu();
    } else {
      closeMoreMenu();
    }
  }

  function bindAdminEvents() {
    moreMenuButton.addEventListener("click", toggleMoreMenu);
    openAdminButton.addEventListener("click", (event) => {
      event.preventDefault();
      requestAdminAccess(openAdminButton.dataset.openAdminTab || "bookings", openAdminPanel);
    });
    closeAdminButton?.addEventListener("click", closeAdminPanel);
    logoutAdminButton?.addEventListener("click", async () => {
      await signOutAdmin();
      closeAdminPanel();
      closeMoreMenu();
    });

    document.addEventListener("click", (event) => {
      if (!moreMenuDropdown.hidden && !event.target.closest(".admin-menu-wrap")) {
        closeMoreMenu();
      }
    });

    adminOverlay.querySelectorAll("[data-close-admin]").forEach((element) => {
      element.addEventListener("click", closeAdminPanel);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMoreMenu();
        if (adminOverlay.classList.contains("open")) closeAdminPanel();
      }
    });

    tabs.forEach((button) => button.addEventListener("click", () => setActiveAdminTab(button.dataset.adminTab)));
    adminOverlay.querySelectorAll("[data-go-admin-tab]").forEach((button) => {
      button.addEventListener("click", () => setActiveAdminTab(button.dataset.goAdminTab));
    });

    bookingSearch.addEventListener("input", (event) => {
      adminState.filters.search = event.target.value;
      renderBookings();
    });

    statusFilter.addEventListener("change", (event) => {
      adminState.filters.status = event.target.value;
      renderBookings();
    });

    dateStartFilter.addEventListener("change", (event) => {
      adminState.filters.start = event.target.value;
      renderBookings();
    });

    dateEndFilter.addEventListener("change", (event) => {
      adminState.filters.end = event.target.value;
      renderBookings();
    });

    reportPeriod.addEventListener("change", (event) => {
      adminState.report.period = event.target.value;
      renderReports();
    });

    reportDate.addEventListener("change", (event) => {
      adminState.report.date = event.target.value || adminTodayIso();
      renderReports();
    });

    periodSummaryCards?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-period-card]");
      if (!card) return;

      adminState.report.period = card.dataset.periodCard;
      reportPeriod.value = adminState.report.period;
      renderReports();
    });

    bookingsTableBody.addEventListener("change", handleAdminActions);
    bookingsTableBody.addEventListener("click", handleAdminActions);
    mobileBookingsList.addEventListener("change", handleAdminActions);
    mobileBookingsList.addEventListener("click", handleAdminActions);
    manualDate.addEventListener("change", updateManualTimeOptions);
    manualBookingForm.addEventListener("submit", addManualBooking);
    exportAllButton.addEventListener("click", () => exportBookingsCsv(getFilteredBookings(), `agendamentos-dk-barber-${adminTodayIso()}.csv`));
    exportReportButton.addEventListener("click", exportCurrentReportCsv);
  }

  adminState.bookings = loadAdminBookings();
  populateManualForm();
  bindAdminEvents();
  renderAdmin();

  window.openEmbeddedAdminPanel = (tab = "bookings") => requestAdminAccess(tab, openAdminPanel);
  window.closeEmbeddedAdminPanel = closeAdminPanel;
  window.refreshEmbeddedAdminPanel = () => {
    adminState.bookings = loadAdminBookings();
    renderAdmin();
    renderTimes();
  };

  return true;
}

function bindBasicAdminFallbackEvents() {
  const moreMenuButton = document.getElementById("moreMenuButton");
  const moreMenuDropdown = document.getElementById("moreMenuDropdown");
  const openAdminButton = document.getElementById("openAdminButton");
  const closeAdminButton = document.getElementById("closeAdminButton");
  const logoutAdminButton = document.getElementById("logoutAdminButton");
  const adminOverlay = document.getElementById("embeddedAdminPanel");

  if (moreMenuButton && moreMenuDropdown) {
    moreMenuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moreMenuDropdown.hidden = !moreMenuDropdown.hidden;
      moreMenuButton.setAttribute("aria-expanded", String(!moreMenuDropdown.hidden));
    });
  }

  if (openAdminButton) {
    openAdminButton.addEventListener("click", (event) => {
      event.preventDefault();
      requestAdminAccess(openAdminButton.dataset.openAdminTab || "bookings", openEmbeddedAdminPanelFallback);
    });
  }

  if (closeAdminButton) {
    closeAdminButton.addEventListener("click", closeEmbeddedAdminPanelFallback);
  }

  if (logoutAdminButton) {
    logoutAdminButton.addEventListener("click", async () => {
      await signOutAdmin();
      closeEmbeddedAdminPanelFallback();
    });
  }

  adminOverlay?.querySelectorAll("[data-close-admin]").forEach((element) => {
    element.addEventListener("click", closeEmbeddedAdminPanelFallback);
  });

  adminOverlay?.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateEmbeddedAdminTab(adminOverlay, button.dataset.adminTab));
  });

  document.addEventListener("click", (event) => {
    if (moreMenuDropdown && !moreMenuDropdown.hidden && !event.target.closest(".admin-menu-wrap")) {
      moreMenuDropdown.hidden = true;
      moreMenuButton?.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeEmbeddedAdminPanelFallback();
  });
}

initAdminLogin();

try {
  const adminInitialized = initEmbeddedAdminPanel();
  if (!adminInitialized) bindBasicAdminFallbackEvents();
} catch (error) {
  console.error("Falha ao iniciar o painel administrativo. Usando abertura básica do painel.", error);
  bindBasicAdminFallbackEvents();
}
