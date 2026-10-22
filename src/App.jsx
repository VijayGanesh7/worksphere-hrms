import { useState } from "react";
import api, { authConfig } from "./api";

const pages = ["Dashboard", "Employees", "Attendance", "Leaves", "Payroll"];

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

function Badge({ value }) {
  const status = String(value || "UNKNOWN").toUpperCase();

  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

function Empty({ title, detail }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

function PanelTitle({ title, subtitle, onRefresh }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {onRefresh && (
        <button className="secondary" type="button" onClick={onRefresh}>
          Refresh
        </button>
      )}
    </div>
  );
}

function isHRRole(role) {
  return ["HR", "ADMIN"].includes(String(role || "").toUpperCase());
}

export default function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("access_token") || ""
  );
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [page, setPage] = useState("Dashboard");

  const [authMode, setAuthMode] = useState("login");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");

  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [payroll, setPayroll] = useState([]);

  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showPayrollForm, setShowPayrollForm] = useState(false);

  const [employeeForm, setEmployeeForm] = useState({
    user_id: "",
    full_name: "",
    designation: "",
    department: "",
    joining_date: "",
    salary: "",
    status: "ACTIVE",
  });

  const [leaveForm, setLeaveForm] = useState({
    employee_id: "",
    leave_type: "CASUAL",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const [payrollForm, setPayrollForm] = useState({
    employee_id: "",
    pay_month: String(currentMonth),
    pay_year: String(currentYear),
    basic_salary: "",
    bonus: "0",
    deductions: "0",
  });

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const isHR = isHRRole(role);
  const config = authConfig(token);

  function clearNotices() {
    setError("");
    setMessage("");
  }

  function handleError(err, fallback) {
    setError(
      err.response?.data?.detail ||
        err.message ||
        fallback ||
        "Something went wrong."
    );
  }

  async function loadDashboard(activeToken = token) {
    const response = await api.get(
      "/admin/dashboard",
      authConfig(activeToken)
    );
    setDashboard(response.data);
  }

  async function loadEmployees(activeToken = token) {
    const response = await api.get(
      "/employees/",
      authConfig(activeToken)
    );
    setEmployees(
      Array.isArray(response.data)
        ? response.data
        : response.data.items || []
    );
  }

  async function loadAttendance(activeToken = token) {
    const response = await api.get(
      "/attendance/my",
      authConfig(activeToken)
    );
    setAttendance(Array.isArray(response.data) ? response.data : []);
  }

  async function loadLeaves(activeToken = token, all = false) {
    const endpoint = all && isHR ? "/leaves/" : "/leaves/my";
    const response = await api.get(endpoint, authConfig(activeToken));
    setLeaves(Array.isArray(response.data) ? response.data : []);
  }

  async function loadPayroll(activeToken = token, all = false) {
    const endpoint = all && isHR ? "/payroll/" : "/payroll/my";
    const response = await api.get(endpoint, authConfig(activeToken));
    setPayroll(Array.isArray(response.data) ? response.data : []);
  }

  async function login(event) {
    event.preventDefault();
    clearNotices();
    setBusy(true);

    try {
      const form = new URLSearchParams({ username, password });

      const response = await api.post("/auth/login", form, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const newToken = response.data.access_token;

      if (!newToken) {
        throw new Error("The login response did not contain an access token.");
      }

      const profile = await api.get("/auth/me", authConfig(newToken));
      const userRole = String(profile.data.role || "").toUpperCase();

      localStorage.setItem("access_token", newToken);
      setToken(newToken);
      setRole(userRole);
      setUsername(profile.data.username || username);
      setPage(isHRRole(userRole) ? "Dashboard" : "Attendance");
      setMessage(`Welcome, ${profile.data.username || username}.`);

      try {
        if (isHRRole(userRole)) {
          await loadDashboard(newToken);
        } else {
          await loadAttendance(newToken);
        }
      } catch {
        // Login can succeed even if a page's data endpoint is unavailable.
      }
    } catch (err) {
      handleError(err, "Login failed. Check your username and password.");
    } finally {
      setBusy(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    clearNotices();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await api.post("/auth/register", {
        username,
        email,
        password,
      });

      setAuthMode("login");
      setPassword("");
      setConfirmPassword("");
      setMessage("Registration successful. Please sign in.");
    } catch (err) {
      handleError(err, "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    setToken("");
    setRole("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setDashboard(null);
    setEmployees([]);
    setAttendance([]);
    setLeaves([]);
    setPayroll([]);
    setPage("Dashboard");
    clearNotices();
  }

  async function navigate(nextPage) {
    clearNotices();

    if (
      ["Dashboard", "Employees"].includes(nextPage) &&
      !isHR
    ) {
      setError("Only HR and Admin users can access this page.");
      return;
    }

    setPage(nextPage);
    setBusy(true);

    try {
      if (nextPage === "Dashboard") await loadDashboard();
      if (nextPage === "Employees") await loadEmployees();
      if (nextPage === "Attendance") await loadAttendance();
      if (nextPage === "Leaves") await loadLeaves(token, isHR);
      if (nextPage === "Payroll") await loadPayroll(token, isHR);
    } catch (err) {
      handleError(err, `Could not load ${nextPage.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  async function submitEmployee(event) {
    event.preventDefault();
    clearNotices();
    setBusy(true);

    try {
      const payload = {
        user_id: Number(employeeForm.user_id),
        full_name: employeeForm.full_name.trim(),
        designation: employeeForm.designation.trim(),
        department: employeeForm.department.trim(),
        joining_date: employeeForm.joining_date,
        salary: Number(employeeForm.salary),
        status: employeeForm.status,
      };

      await api.post("/employees/", payload, config);

      setEmployeeForm({
        user_id: "",
        full_name: "",
        designation: "",
        department: "",
        joining_date: "",
        salary: "",
        status: "ACTIVE",
      });

      setShowEmployeeForm(false);
      await loadEmployees();
      setMessage("Employee profile created successfully.");
    } catch (err) {
      handleError(
        err,
        "Could not create employee. Check the registered user ID and form details."
      );
    } finally {
      setBusy(false);
    }
  }

  async function attendanceAction(action) {
    clearNotices();
    setBusy(true);

    try {
      const response =
        action === "in"
          ? await api.post("/attendance/check-in", {}, config)
          : await api.patch("/attendance/check-out", {}, config);

      await loadAttendance();
      setMessage(
        response.data.message ||
          (action === "in"
            ? "Check-in recorded successfully."
            : "Check-out recorded successfully.")
      );
    } catch (err) {
      handleError(err, "Attendance action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitLeave(event) {
    event.preventDefault();
    clearNotices();
    setBusy(true);

    try {
      const params = new URLSearchParams({
        ...leaveForm,
        employee_id: leaveForm.employee_id,
      });

      const response = await api.post(
        `/leaves/?${params.toString()}`,
        null,
        config
      );

      setLeaveForm({
        employee_id: "",
        leave_type: "CASUAL",
        start_date: "",
        end_date: "",
        reason: "",
      });

      await loadLeaves(token, false);
      setMessage(response.data.message || "Leave request submitted.");
    } catch (err) {
      handleError(err, "Could not submit the leave request.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewLeave(id, decision) {
    clearNotices();
    setBusy(true);

    try {
      await api.patch(
        `/leaves/${id}/review?decision=${decision}`,
        null,
        config
      );

      await loadLeaves(token, true);
      setMessage(`Leave ${decision.toLowerCase()}.`);
    } catch (err) {
      handleError(err, "Could not review the leave request.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayroll(event) {
    event.preventDefault();
    clearNotices();
    setBusy(true);

    try {
      const params = {
        employee_id: Number(payrollForm.employee_id),
        pay_month: Number(payrollForm.pay_month),
        pay_year: Number(payrollForm.pay_year),
        basic_salary: Number(payrollForm.basic_salary),
        bonus: Number(payrollForm.bonus || 0),
        deductions: Number(payrollForm.deductions || 0),
      };

      if (
        !params.employee_id ||
        params.pay_month < 1 ||
        params.pay_month > 12 ||
        params.pay_year < 2000 ||
        params.basic_salary < 0 ||
        params.bonus < 0 ||
        params.deductions < 0
      ) {
        setError("Please enter valid employee, month, year, and salary details.");
        return;
      }

      await api.post("/payroll/", null, {
        ...authConfig(token),
        params,
      });

      setPayrollForm({
        employee_id: "",
        pay_month: String(currentMonth),
        pay_year: String(currentYear),
        basic_salary: "",
        bonus: "0",
        deductions: "0",
      });

      setShowPayrollForm(false);
      await loadPayroll(token, true);
      setMessage("Payroll created successfully. It is pending review.");
    } catch (err) {
      handleError(
        err,
        "Could not create payroll. Verify the employee ID and backend endpoint."
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewPayroll(id, decision) {
    clearNotices();
    setBusy(true);

    try {
      await api.patch(
        `/payroll/${id}/review?decision=${decision}`,
        null,
        config
      );

      await loadPayroll(token, true);
      setMessage(`Payroll ${decision.toLowerCase()}.`);
    } catch (err) {
      handleError(err, "Could not review this payroll record.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPayslip(id) {
    clearNotices();
    setBusy(true);

    let downloadUrl;

    try {
      const endpoint = isHR
        ? `/payroll/${id}/payslip/pdf`
        : `/payroll/my/${id}/payslip/pdf`;

      const response = await api.get(endpoint, {
        ...authConfig(token),
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/pdf",
      });

      downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `worksphere_payslip_${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage("Payslip download started.");
    } catch (err) {
      handleError(err, "Could not download the payslip.");
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="login-shell">
        <form
          className="login-card"
          onSubmit={authMode === "login" ? login : register}
        >
          <div className="logo">W</div>
          <p className="eyebrow">WORKSPHERE HRMS</p>

          <h1>
            {authMode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h1>

          <p className="muted">
            {authMode === "login"
              ? "Sign in to manage your workday."
              : "Create an account to get started."}
          </p>

          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />

          {authMode === "register" && (
            <>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </>
          )}

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              authMode === "login" ? "current-password" : "new-password"
            }
            minLength={6}
            required
          />

          {authMode === "register" && (
            <>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                required
              />
            </>
          )}

          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice success">{message}</div>}

          <button className="primary full" disabled={busy}>
            {busy
              ? "Please wait..."
              : authMode === "login"
                ? "Sign in"
                : "Create account"}
          </button>

          <p className="auth-switch">
            {authMode === "login"
              ? "New to WorkSphere?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                clearNotices();
                setPassword("");
                setConfirmPassword("");
              }}
            >
              {authMode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </form>
      </main>
    );
  }

  const metrics = dashboard
    ? [
        ["Total employees", dashboard.total_employees],
        ["Active employees", dashboard.active_employees],
        ["Present today", dashboard.present_today],
        ["Absent today", dashboard.absent_today],
        ["Attendance rate", `${dashboard.attendance_percentage ?? 0}%`],
        ["Pending leaves", dashboard.pending_leave_requests],
        ["Pending payroll", dashboard.pending_payroll_records],
        ["Approved payroll", dashboard.approved_payroll_records],
      ]
    : [];

  const pageDescriptions = {
    Dashboard: "Your workforce and operations at a glance.",
    Employees: "Manage employee profiles and information.",
    Attendance: "Record check-in and check-out times.",
    Leaves: "Submit leave requests and review approvals.",
    Payroll: "Create payroll records and manage payslips.",
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo small">W</div>
          <div>
            <strong>WorkSphere</strong>
            <span>HR Management System</span>
          </div>
        </div>

        <p className="nav-caption">WORKSPACE</p>

        <nav>
          {pages
            .filter(
              (item) =>
                isHR || !["Dashboard", "Employees"].includes(item)
            )
            .map((item) => (
              <button
                key={item}
                className={`nav-item ${page === item ? "selected" : ""}`}
                onClick={() => navigate(item)}
                disabled={busy}
              >
                {item}
              </button>
            ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-line">
            <div className="avatar">
              {(username[0] || "U").toUpperCase()}
            </div>
            <div>
              <strong>{username}</strong>
              <span>{role}</span>
            </div>
          </div>

          <button className="logout-link" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="page-header">
          <div>
            <p className="eyebrow">WORKSPACE / {page.toUpperCase()}</p>
            <h1>{page}</h1>
            <p className="muted">{pageDescriptions[page]}</p>
          </div>

          <div className="header-user">
            <strong>{username}</strong>
            <span>{role}</span>
          </div>
        </header>

        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}
        {busy && <p className="loading">Processing your request...</p>}

        {page === "Dashboard" && (
          isHR ? (
            <section className="panel">
              <PanelTitle
                title="Workforce overview"
                subtitle="Current HR metrics"
                onRefresh={() => navigate("Dashboard")}
              />

              {dashboard ? (
                <div className="metrics-grid">
                  {metrics.map(([label, value]) => (
                    <article className="metric-card" key={label}>
                      <div className="metric-title">{label}</div>
                      <strong>{value ?? "—"}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Dashboard unavailable"
                  detail="Refresh the page or check the backend dashboard endpoint."
                />
              )}
            </section>
          ) : (
            <section className="panel">
              <PanelTitle
                title={`Welcome, ${username}`}
                subtitle="Access your attendance, leaves and payroll."
              />
              <div className="actions">
                <button onClick={() => navigate("Attendance")}>Attendance</button>
                <button onClick={() => navigate("Leaves")}>My leaves</button>
                <button onClick={() => navigate("Payroll")}>My payroll</button>
              </div>
            </section>
          )
        )}

        {page === "Employees" && (
          isHR ? (
            <section className="panel">
              <PanelTitle
                title="Employee directory"
                subtitle={`${employees.length} employee record(s)`}
                onRefresh={() => navigate("Employees")}
              />

              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    clearNotices();
                    setShowEmployeeForm((visible) => !visible);
                  }}
                  disabled={busy}
                >
                  {showEmployeeForm ? "Cancel" : "Add Employee"}
                </button>
              </div>

              {showEmployeeForm && (
                <form className="form-grid" onSubmit={submitEmployee}>
                  <label>
                    Registered User ID
                    <input
                      type="number"
                      min="1"
                      value={employeeForm.user_id}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          user_id: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Full name
                    <input
                      value={employeeForm.full_name}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          full_name: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Designation
                    <input
                      value={employeeForm.designation}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          designation: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Department
                    <input
                      value={employeeForm.department}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          department: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Joining date
                    <input
                      type="date"
                      value={employeeForm.joining_date}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          joining_date: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Salary (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={employeeForm.salary}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          salary: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Status
                    <select
                      value={employeeForm.status}
                      onChange={(event) =>
                        setEmployeeForm({
                          ...employeeForm,
                          status: event.target.value,
                        })
                      }
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </label>

                  <button className="primary" disabled={busy}>
                    Save Employee
                  </button>
                </form>
              )}

              {employees.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Designation</th>
                        <th>Department</th>
                        <th>Joining date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id}>
                          <td>{employee.id}</td>
                          <td>{employee.full_name}</td>
                          <td>{employee.designation}</td>
                          <td>{employee.department}</td>
                          <td>{employee.joining_date || "—"}</td>
                          <td><Badge value={employee.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No employees found"
                  detail="Create an employee profile or refresh the directory."
                />
              )}
            </section>
          ) : (
            <Empty
              title="Access restricted"
              detail="Only HR and Admin users can view employees."
            />
          )
        )}

        {page === "Attendance" && (
          <section className="panel">
            <PanelTitle
              title="My attendance"
              subtitle="Record your working hours."
              onRefresh={() => navigate("Attendance")}
            />

            <div className="actions">
              <button
                className="primary"
                onClick={() => attendanceAction("in")}
                disabled={busy}
              >
                Check in
              </button>
              <button
                className="secondary"
                onClick={() => attendanceAction("out")}
                disabled={busy}
              >
                Check out
              </button>
            </div>

            {attendance.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr key={record.id}>
                        <td>{record.attendance_date || "—"}</td>
                        <td>
                          {record.check_in
                            ? new Date(record.check_in).toLocaleString()
                            : "—"}
                        </td>
                        <td>
                          {record.check_out
                            ? new Date(record.check_out).toLocaleString()
                            : "—"}
                        </td>
                        <td><Badge value={record.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No attendance records"
                detail="Check in to create your attendance record."
              />
            )}
          </section>
        )}

        {page === "Leaves" && (
          <>
            <section className="panel">
              <PanelTitle
                title="Request leave"
                subtitle="Submit a new leave request."
              />

              <form className="form-grid" onSubmit={submitLeave}>
                <label>
                  Employee ID
                  <input
                    type="number"
                    min="1"
                    value={leaveForm.employee_id}
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        employee_id: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Leave type
                  <select
                    value={leaveForm.leave_type}
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        leave_type: event.target.value,
                      })
                    }
                  >
                    <option value="CASUAL">Casual</option>
                    <option value="SICK">Sick</option>
                    <option value="EARNED">Earned</option>
                    <option value="UNPAID">Unpaid</option>
                  </select>
                </label>

                <label>
                  Start date
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        start_date: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  End date
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        end_date: event.target.value,
                      })
                    }
                    min={leaveForm.start_date || undefined}
                    required
                  />
                </label>

                <label className="span-two">
                  Reason
                  <textarea
                    value={leaveForm.reason}
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        reason: event.target.value,
                      })
                    }
                    rows="3"
                    required
                  />
                </label>

                <button className="primary" disabled={busy}>
                  Submit leave request
                </button>
              </form>
            </section>

            <section className="panel">
              <PanelTitle
                title={isHR ? "Leave management" : "My leave requests"}
                subtitle="View leave status and review pending requests."
                onRefresh={() => navigate("Leaves")}
              />

              {leaves.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Employee ID</th>
                        <th>Type</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                        {isHR && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.map((leave) => (
                        <tr key={leave.id}>
                          <td>{leave.id}</td>
                          <td>{leave.employee_id ?? "—"}</td>
                          <td>{leave.leave_type}</td>
                          <td>{leave.start_date}</td>
                          <td>{leave.end_date}</td>
                          <td><Badge value={leave.status} /></td>
                          {isHR && (
                            <td>
                              {String(leave.status).toUpperCase() === "PENDING" ? (
                                <div className="actions">
                                  <button
                                    disabled={busy}
                                    onClick={() => reviewLeave(leave.id, "APPROVED")}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => reviewLeave(leave.id, "REJECTED")}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                "Reviewed"
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No leave requests"
                  detail="Your leave requests will appear here."
                />
              )}
            </section>
          </>
        )}

        {page === "Payroll" && (
          <section className="panel">
            <PanelTitle
              title={isHR ? "Payroll management" : "My payroll"}
              subtitle="Create payroll records, review payments, and download payslips."
              onRefresh={() => navigate("Payroll")}
            />

            {isHR && (
              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearNotices();
                    setShowPayrollForm((visible) => !visible);
                  }}
                >
                  {showPayrollForm ? "Cancel" : "Add Payroll"}
                </button>
              </div>
            )}

            {showPayrollForm && isHR && (
              <form className="form-grid" onSubmit={submitPayroll}>
                <label>
                  Employee ID
                  <input
                    type="number"
                    min="1"
                    value={payrollForm.employee_id}
                    onChange={(event) =>
                      setPayrollForm({
                        ...payrollForm,
                        employee_id: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Pay month
                  <select
                    value={payrollForm.pay_month}
                    onChange={(event) =>
                      setPayrollForm({
                        ...payrollForm,
                        pay_month: event.target.value,
                      })
                    }
                    required
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {new Date(2000, index).toLocaleString("en-IN", {
                          month: "long",
                        })}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Pay year
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    value={payrollForm.pay_year}
                    onChange={(event) =>
                      setPayrollForm({
                        ...payrollForm,
                        pay_year: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Basic salary (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payrollForm.basic_salary}
                    onChange={(event) =>
                      setPayrollForm({
                        ...payrollForm,
                        basic_salary: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Bonus (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payrollForm.bonus}
                    onChange={(event) =>
                      setPayrollForm({
                        ...payrollForm,
                        bonus: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Deductions (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payrollForm.deductions}
                    onChange={(event) =>
                      setPayrollForm({
                        ...payrollForm,
                        deductions: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="span-two">
                  <button className="primary" disabled={busy}>
                    {busy ? "Creating..." : "Create Payroll"}
                  </button>
                </div>
              </form>
            )}

            {payroll.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      {isHR && <th>Employee ID</th>}
                      <th>Month</th>
                      <th>Year</th>
                      <th>Basic salary</th>
                      <th>Bonus</th>
                      <th>Deductions</th>
                      <th>Net salary</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.map((record) => (
                      <tr key={record.id}>
                        <td>{record.id}</td>
                        {isHR && <td>{record.employee_id ?? "—"}</td>}
                        <td>{record.pay_month}</td>
                        <td>{record.pay_year}</td>
                        <td>{money(record.basic_salary)}</td>
                        <td>{money(record.bonus)}</td>
                        <td>{money(record.deductions)}</td>
                        <td>{money(record.net_salary)}</td>
                        <td><Badge value={record.status} /></td>
                        <td>
                          <div className="actions">
                            {isHR &&
                              String(record.status).toUpperCase() === "PENDING" && (
                                <>
                                  <button
                                    disabled={busy}
                                    onClick={() => reviewPayroll(record.id, "APPROVED")}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => reviewPayroll(record.id, "REJECTED")}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            <button
                              disabled={busy}
                              onClick={() => downloadPayslip(record.id)}
                            >
                              Payslip PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No payroll records"
                detail={
                  isHR
                    ? "Click Add Payroll to create a payroll record for an employee."
                    : "Your payroll records will appear here when HR creates them."
                }
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

