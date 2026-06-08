// ================================================
// MOTORONE · Full Version
// SUPABASE_URL과 SUPABASE_KEY를 실제 값으로 교체하세요
// ================================================
import { useState, useEffect } from "react";

const SUPABASE_URL = "https://lcnowfefkwtexkxtbazp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjbm93ZmVma3d0ZXhreHRiYXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTU0OTcsImV4cCI6MjA5NjQ5MTQ5N30.oj7F9Lm57pdvAm7hyXQ5pBn3VaFjP2_O6-o7QBIFH3I";
const DEALER_PASSWORD = "0426";

const sb = {
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  },
  async select(table, query = "") {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { ...this.headers, "Prefer": "return=representation" },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.headers, "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async update(table, match, data) {
    const query = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: { ...this.headers, "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async delete(table, match) {
    const query = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },
};

async function fetchDealer() {
  const d = await sb.select("dealers", "select=*&limit=1");
  return d[0];
}
async function fetchCars(status) {
  const cars = await sb.select("cars",
    `select=id,model,trim,year,mileage,fuel,transmission,price,description,accident_free,certified,reg_by,status,dealer_id&status=eq.${status}&order=created_at.desc`
  );
  return Promise.all(cars.map(async car => {
    const opts = await sb.select("car_options", `select=option_name&car_id=eq.${car.id}`);
    return { ...car, options: opts.map(o => o.option_name) };
  }));
}
async function fetchInquiries() {
  return sb.select("inquiries", "select=*&order=created_at.desc");
}

const GOLD = "#C9A84C";
const BG = "#0A0A0A";

export default function App() {
  const [mode, setMode] = useState("buyer"); // buyer | dealer
  const [dealerAuthed, setDealerAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [view, setView] = useState("home"); // home|list|detail|register|inquiry_form|mycar|dealer_inquiries|edit
  const [dealer, setDealer] = useState(null);
  const [approvedCars, setApprovedCars] = useState([]);
  const [pendingCars, setPendingCars] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCar, setSelectedCar] = useState(null);
  const [editCar, setEditCar] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inquiryDone, setInquiryDone] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ name: "", phone: "", message: "" });
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regForm, setRegForm] = useState(defaultRegForm("dealer"));
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [regLoading, setRegLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  function defaultRegForm(regBy) {
    return { model: "", trim: "", year: "", mileage: "", fuel: "가솔린", transmission: "자동", price: "", description: "", accidentFree: true, regBy };
  }

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [d, approved, pending, inqs] = await Promise.all([
        fetchDealer(), fetchCars("approved"), fetchCars("pending"), fetchInquiries(),
      ]);
      setDealer(d); setApprovedCars(approved); setPendingCars(pending); setInquiries(inqs);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const toggleFav = id => setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const toggleOption = opt => setSelectedOptions(o => o.includes(opt) ? o.filter(x => x !== opt) : [...o, opt]);

  const allCars = [...approvedCars, ...(mode === "dealer" ? pendingCars : [])];
  const filtered = allCars.filter(c =>
    !searchQuery || `${c.model} ${c.trim}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 딜러 로그인
  const handleDealerLogin = () => {
    if (pwInput === DEALER_PASSWORD) {
      setDealerAuthed(true); setPwError(false); setPwInput("");
      setView("home");
    } else {
      setPwError(true);
    }
  };

  // 문의 제출
  const handleInquiry = async () => {
    if (!inquiryForm.name || !inquiryForm.phone) { alert("이름과 연락처를 입력해주세요."); return; }
    setInquiryLoading(true);
    try {
      await sb.insert("inquiries", {
        car_id: selectedCar.id, dealer_id: dealer?.id,
        buyer_name: inquiryForm.name, buyer_phone: inquiryForm.phone,
        message: inquiryForm.message, status: "new",
      });
      setInquiryDone(true);
      await loadData();
    } catch (e) { alert("오류: " + e.message); }
    finally { setInquiryLoading(false); }
  };

  // 차량 등록
  const handleRegister = async () => {
    if (!regForm.model || !regForm.year || !regForm.price) { alert("모델, 연식, 가격은 필수입니다."); return; }
    setRegLoading(true);
    try {
      const [car] = await sb.insert("cars", {
        dealer_id: dealer?.id, brand: "Mercedes-Benz",
        model: regForm.model, trim: regForm.trim,
        year: parseInt(regForm.year), mileage: parseInt(regForm.mileage),
        fuel: regForm.fuel, transmission: regForm.transmission,
        price: parseInt(regForm.price), description: regForm.description,
        accident_free: regForm.accidentFree, reg_by: regForm.regBy,
        status: "pending",
      });
      if (selectedOptions.length > 0) {
        await sb.insert("car_options", selectedOptions.map(name => ({ car_id: car.id, option_name: name })));
      }
      await loadData();
      setRegStep(5);
    } catch (e) { alert("등록 오류: " + e.message); }
    finally { setRegLoading(false); }
  };

  // 차량 수정
  const handleEdit = async () => {
    if (!editCar) return;
    try {
      await sb.update("cars", { id: editCar.id }, {
        model: editCar.model, trim: editCar.trim,
        year: parseInt(editCar.year), mileage: parseInt(editCar.mileage),
        fuel: editCar.fuel, transmission: editCar.transmission,
        price: parseInt(editCar.price), description: editCar.description,
        accident_free: editCar.accident_free,
      });
      await loadData();
      setView("home");
      alert("수정 완료!");
    } catch (e) { alert("수정 오류: " + e.message); }
  };

  // 차량 삭제
  const handleDelete = async (carId) => {
    try {
      await sb.delete("car_options", { car_id: carId });
      await sb.delete("cars", { id: carId });
      await loadData();
      setDeleteConfirm(null);
      setView("home");
    } catch (e) { alert("삭제 오류: " + e.message); }
  };

  // 승인
  const handleApprove = async (carId) => {
    try {
      await sb.update("cars", { id: carId }, { status: "approved" });
      await loadData();
    } catch (e) { alert("승인 오류: " + e.message); }
  };

  // 문의 상태 변경
  const handleInquiryStatus = async (id, status) => {
    try {
      await sb.update("inquiries", { id }, { status });
      await loadData();
    } catch (e) { alert("오류: " + e.message); }
  };

  const S = { // styles shorthand
    page: { fontFamily: "'Noto Sans KR', sans-serif", background: BG, minHeight: "100vh", color: "#F0EDE8", maxWidth: 430, margin: "0 auto" },
    card: { background: "#111", border: "1px solid #1C1C1C", borderRadius: 12 },
    gold: { color: GOLD },
    btn: (full) => ({ width: full ? "100%" : "auto", padding: "13px 0", borderRadius: 10, background: `linear-gradient(135deg, ${GOLD}, #A07830)`, color: BG, fontSize: 14, fontWeight: 900, fontFamily: "'Noto Sans KR'", cursor: "pointer", border: "none" }),
    input: { width: "100%", background: "#111", border: "1px solid #1C1C1C", borderRadius: 10, padding: "11px 13px", color: "#F0EDE8", fontSize: 14, fontFamily: "'Noto Sans KR'", outline: "none" },
    label: { fontSize: 11, color: "#666", marginBottom: 5, display: "block" },
    back: (fn) => (
      <button onClick={fn} style={{ padding: "14px 20px", fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 5, fontFamily: "'Noto Sans KR'", background: "none", border: "none", cursor: "pointer" }}>← 돌아가기</button>
    ),
  };

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Cormorant+Garamond:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; }
        input, select, textarea { outline: none; }
        button { cursor: pointer; border: none; background: none; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .fadeUp { animation: fadeUp .35s ease both; }
        .tap:active { opacity: .8; transform: scale(.98); }
      `}</style>

      {/* HEADER */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(16px)", borderBottom: "1px solid #1C1C1C", padding: "14px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div onClick={() => setView("home")} style={{ cursor: "pointer" }}>
          <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: 2 }}>MOTORONE</div>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 3 }}>MERCEDES-BENZ OFFICIAL DEALER</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: error ? "#F03E3E" : loading ? GOLD : "#4CAF50" }} />
          {["buyer", "dealer"].map(m => (
            <button key={m} onClick={() => {
              if (m === "dealer" && !dealerAuthed) { setMode("dealer"); setView("dealer_login"); return; }
              if (m === "buyer") { setMode("buyer"); setView("home"); }
              else { setMode("dealer"); setView("home"); }
            }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 4, fontFamily: "'Noto Sans KR'", background: mode === m ? GOLD : "#141414", color: mode === m ? BG : "#666", border: "1px solid", borderColor: mode === m ? GOLD : "#222", fontWeight: mode === m ? 700 : 400, transition: "all .2s" }}>
              {m === "buyer" ? "구매자" : "딜러"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingBottom: 80 }}>

        {/* 로딩 */}
        {loading && <div style={{ textAlign: "center", padding: "80px 20px" }}><div style={{ width: 32, height: 32, border: `3px solid #1C1C1C`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} /><div style={{ fontSize: 13, color: "#555" }}>로딩중...</div></div>}

        {/* 오류 */}
        {!loading && error && <div style={{ margin: 20, background: "#1A0808", border: "1px solid #F03E3E44", borderRadius: 12, padding: 20 }}><div style={{ color: "#F03E3E", fontWeight: 700, marginBottom: 8 }}>⚠️ 연결 오류</div><div style={{ fontSize: 11, color: "#AA8888", marginBottom: 16 }}>App.js 상단 SUPABASE_URL과 SUPABASE_KEY를 교체해주세요.</div><button onClick={loadData} style={{ background: GOLD, color: BG, fontSize: 12, padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontFamily: "'Noto Sans KR'" }}>다시 시도</button></div>}

        {!loading && !error && (<>

          {/* ══ 딜러 로그인 ══ */}
          {view === "dealer_login" && (
            <div className="fadeUp" style={{ padding: "60px 32px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 4, marginBottom: 12 }}>DEALER ACCESS</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 32 }}>딜러 로그인</div>
              <div style={{ marginBottom: 16 }}>
                <div style={S.label}>비밀번호</div>
                <input type="password" placeholder="••••" value={pwInput}
                  onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                  onKeyDown={e => e.key === "Enter" && handleDealerLogin()}
                  style={{ ...S.input, fontSize: 24, letterSpacing: 8, textAlign: "center" }}
                />
                {pwError && <div style={{ fontSize: 11, color: "#F03E3E", marginTop: 6 }}>비밀번호가 틀렸습니다.</div>}
              </div>
              <button onClick={handleDealerLogin} style={{ ...S.btn(true) }}>입장하기</button>
            </div>
          )}

          {/* ══ HOME BUYER ══ */}
          {view === "home" && mode === "buyer" && (
            <div className="fadeUp">
              <div style={{ padding: "32px 24px 24px", borderBottom: "1px solid #1C1C1C" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 4, marginBottom: 10 }}>CERTIFIED PRE-OWNED</div>
                <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.25, marginBottom: 10 }}>공식 딜러가 직접<br /><span style={S.gold}>검증한 중고차</span></div>
                <div style={{ display: "flex", gap: 8, background: "#111", border: "1px solid #1C1C1C", borderRadius: 10, padding: "10px 14px", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#555" }}>🔍</span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && setView("list")}
                    placeholder="모델명 검색 (E300, GLC...)"
                    style={{ flex: 1, background: "none", border: "none", color: "#F0EDE8", fontSize: 14, fontFamily: "'Noto Sans KR'" }}
                  />
                  <button onClick={() => setView("list")} style={{ background: GOLD, color: BG, fontSize: 12, padding: "5px 14px", borderRadius: 6, fontFamily: "'Noto Sans KR'", fontWeight: 700 }}>검색</button>
                </div>
              </div>
              {dealer && <DealerCard dealer={dealer} />}
              <div style={{ padding: "20px 20px 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>등록 매물 <span style={{ fontSize: 11, color: GOLD, fontFamily: "'Space Mono'" }}>{approvedCars.length}</span></div>
                  <button onClick={() => setView("list")} style={{ fontSize: 12, color: GOLD, fontFamily: "'Noto Sans KR'" }}>전체보기 →</button>
                </div>
                {approvedCars.map((car, i) => <CarRow key={car.id} car={car} fav={favorites.includes(car.id)} onFav={() => toggleFav(car.id)} onClick={() => { setSelectedCar(car); setView("detail"); }} delay={i * 0.07} />)}
              </div>
            </div>
          )}

          {/* ══ HOME DEALER ══ */}
          {view === "home" && mode === "dealer" && dealerAuthed && (
            <div className="fadeUp">
              <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #1C1C1C" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 8 }}>DEALER DASHBOARD</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>안녕하세요, <span style={S.gold}>{dealer?.name} {dealer?.title}</span>님</div>
                <div style={{ fontSize: 12, color: "#555" }}>{dealer?.team}</div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "16px 20px 0" }}>
                {[
                  { label: "승인 매물", val: approvedCars.length, color: GOLD },
                  { label: "검수 대기", val: pendingCars.length, color: "#F03E3E" },
                  { label: "신규 문의", val: inquiries.filter(i => i.status === "new").length, color: "#4CAF50" },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, padding: "14px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: s.color, fontFamily: "'Space Mono'" }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* 검수 대기 */}
              {pendingCars.length > 0 && (
                <div style={{ padding: "20px 20px 0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#F03E3E", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F03E3E", animation: "pulse 1.5s infinite" }} />검수 대기
                  </div>
                  {pendingCars.map(car => (
                    <div key={car.id} style={{ ...S.card, padding: 14, marginBottom: 10, borderColor: "#F03E3E22" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{car.model} {car.trim}</div>
                          <div style={{ fontSize: 11, color: "#666" }}>{car.year}년 · {(car.mileage / 10000).toFixed(1)}만km · <span style={S.gold}>{car.reg_by === "owner" ? "차주 등록" : "딜러 등록"}</span></div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, fontFamily: "'Space Mono'" }}>{car.price?.toLocaleString()}만</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleApprove(car.id)} className="tap" style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: GOLD, color: BG, fontSize: 13, fontWeight: 900, fontFamily: "'Noto Sans KR'" }}>✓ 승인</button>
                        <button onClick={() => { setEditCar(car); setView("edit"); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#AAA", fontSize: 13, fontFamily: "'Noto Sans KR'" }}>✏️ 수정</button>
                        <button onClick={() => setDeleteConfirm(car.id)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#1A0808", border: "1px solid #F03E3E33", color: "#F03E3E", fontSize: 13, fontFamily: "'Noto Sans KR'" }}>🗑️ 삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 승인된 매물 */}
              <div style={{ padding: "20px 20px 0" }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>승인된 매물</div>
                {approvedCars.map((car, i) => (
                  <div key={car.id} style={{ ...S.card, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{car.model} {car.trim}</div>
                        <div style={{ fontSize: 11, color: "#666" }}>{car.year}년 · {(car.mileage / 10000).toFixed(1)}만km</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, fontFamily: "'Space Mono'" }}>{car.price?.toLocaleString()}만</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditCar({ ...car }); setView("edit"); }} style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#AAA", fontSize: 12, fontFamily: "'Noto Sans KR'" }}>✏️ 수정</button>
                      <button onClick={() => setDeleteConfirm(car.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "#1A0808", border: "1px solid #F03E3E33", color: "#F03E3E", fontSize: 12, fontFamily: "'Noto Sans KR'" }}>🗑️ 삭제</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: "16px 20px 0" }}>
                <button onClick={() => { setRegStep(1); setSelectedOptions([]); setRegForm(defaultRegForm("dealer")); setView("register"); }} className="tap" style={{ ...S.btn(true) }}>+ 새 차량 등록하기</button>
              </div>
            </div>
          )}

          {/* ══ 문의함 (딜러) ══ */}
          {view === "dealer_inquiries" && mode === "dealer" && (
            <div className="fadeUp">
              {S.back(() => setView("home"))}
              <div style={{ padding: "0 20px" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 6 }}>INQUIRIES</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>문의함 <span style={{ fontSize: 13, color: GOLD }}>({inquiries.length})</span></div>

                {inquiries.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                    <div>아직 문의가 없어요</div>
                  </div>
                ) : inquiries.map(inq => {
                  const car = allCars.find(c => c.id === inq.car_id);
                  const statusMap = { new: { label: "신규", color: "#F03E3E" }, contacted: { label: "연락완료", color: GOLD }, negotiating: { label: "협의중", color: "#748FFC" }, completed: { label: "거래완료", color: "#4CAF50" }, cancelled: { label: "취소", color: "#555" } };
                  const st = statusMap[inq.status] || statusMap.new;
                  return (
                    <div key={inq.id} style={{ ...S.card, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{inq.buyer_name}</div>
                        <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}44` }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>📞 {inq.buyer_phone}</div>
                      {car && <div style={{ fontSize: 11, color: GOLD, marginBottom: 6 }}>🚗 {car.model} {car.trim} · {car.price?.toLocaleString()}만원</div>}
                      {inq.message && <div style={{ fontSize: 12, color: "#AAA", background: "#0A0A0A", borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.6 }}>{inq.message}</div>}
                      <div style={{ fontSize: 10, color: "#444", marginBottom: 10 }}>{new Date(inq.created_at).toLocaleString("ko-KR")}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["new", "contacted", "negotiating", "completed"].map(s => (
                          <button key={s} onClick={() => handleInquiryStatus(inq.id, s)}
                            style={{ fontSize: 10, padding: "5px 10px", borderRadius: 6, fontFamily: "'Noto Sans KR'", background: inq.status === s ? GOLD : "#1A1A1A", color: inq.status === s ? BG : "#777", border: `1px solid ${inq.status === s ? GOLD : "#2A2A2A"}` }}>
                            {statusMap[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ LIST ══ */}
          {view === "list" && (
            <div className="fadeUp">
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #1A1A1A" }}>
                <div style={{ display: "flex", gap: 8, background: "#111", border: "1px solid #1C1C1C", borderRadius: 10, padding: "8px 12px", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#555" }}>🔍</span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="모델명 검색..."
                    style={{ flex: 1, background: "none", border: "none", color: "#F0EDE8", fontSize: 14, fontFamily: "'Noto Sans KR'" }} />
                </div>
              </div>
              <div style={{ padding: "10px 20px 4px", fontSize: 12, color: "#555" }}>총 <span style={{ color: GOLD, fontWeight: 700 }}>{filtered.length}</span>개 매물</div>
              <div style={{ padding: "8px 20px" }}>
                {filtered.map((car, i) => <CarRow key={car.id} car={car} fav={favorites.includes(car.id)} onFav={() => toggleFav(car.id)} onClick={() => { setSelectedCar(car); setView("detail"); }} delay={i * 0.06} />)}
              </div>
            </div>
          )}

          {/* ══ DETAIL ══ */}
          {view === "detail" && selectedCar && (
            <div>
              {S.back(() => setView("list"))}
              <div style={{ margin: "0 20px", height: 180, borderRadius: 14, background: `linear-gradient(135deg, ${GOLD}18, ${BG})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, border: `1px solid ${GOLD}22`, position: "relative" }}>
                🏎️
                <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
                  {selectedCar.certified && <Badge text="공식인증" color={GOLD} />}
                  {selectedCar.accident_free && <Badge text="무사고" color="#4CAF50" />}
                  {selectedCar.reg_by === "owner" && <Badge text="차주등록" color="#748FFC" />}
                </div>
                <button onClick={() => toggleFav(selectedCar.id)} style={{ position: "absolute", top: 12, right: 12, fontSize: 22, background: "rgba(0,0,0,0.5)", width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {favorites.includes(selectedCar.id) ? "❤️" : "🤍"}
                </button>
              </div>
              <div style={{ padding: "20px 20px 0" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 4 }}>MERCEDES-BENZ</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 2 }}>{selectedCar.model}</div>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>{selectedCar.trim}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: GOLD, fontFamily: "'Cormorant Garamond'", marginBottom: 18 }}>{selectedCar.price?.toLocaleString()}<span style={{ fontSize: 14, color: "#666", fontFamily: "'Noto Sans KR'" }}>만원</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[["연식", `${selectedCar.year}년`], ["주행거리", `${(selectedCar.mileage / 10000).toFixed(1)}만km`], ["연료", selectedCar.fuel], ["변속기", selectedCar.transmission]].map(([l, v]) => (
                    <div key={l} style={{ ...S.card, padding: "11px 13px" }}>
                      <div style={{ fontSize: 10, color: "#444", marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selectedCar.options?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 7 }}>주요 옵션</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {selectedCar.options.map(opt => <span key={opt} style={{ fontSize: 11, background: "#111", border: `1px solid ${GOLD}33`, color: `${GOLD}88`, padding: "4px 10px", borderRadius: 5 }}>{opt}</span>)}
                    </div>
                  </div>
                )}
                {selectedCar.description && (
                  <div style={{ ...S.card, padding: 15, marginBottom: 18 }}>
                    <div style={{ fontSize: 11, color: "#444", marginBottom: 6 }}>차량 설명</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "#CCC" }}>{selectedCar.description}</div>
                  </div>
                )}
                {dealer && <DealerCard dealer={dealer} compact />}
                <div style={{ display: "flex", gap: 10, paddingBottom: 24, marginTop: 16 }}>
                  <button onClick={() => toggleFav(selectedCar.id)} style={{ flex: 1, padding: "13px 0", borderRadius: 10, background: "#111", border: "1px solid #222", color: favorites.includes(selectedCar.id) ? GOLD : "#555", fontSize: 14, fontFamily: "'Noto Sans KR'", fontWeight: 700 }}>
                    {favorites.includes(selectedCar.id) ? "❤️ 찜됨" : "🤍 찜"}
                  </button>
                  <button onClick={() => { setInquiryDone(false); setInquiryForm({ name: "", phone: "", message: "" }); setView("inquiry_form"); }} className="tap" style={{ flex: 2, ...S.btn() }}>딜러에게 문의하기</button>
                </div>
              </div>
            </div>
          )}

          {/* ══ 문의 폼 ══ */}
          {view === "inquiry_form" && (
            <div>
              {S.back(() => setView("detail"))}
              <div style={{ padding: "0 20px" }}>
                {!inquiryDone ? (
                  <>
                    <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 6 }}>CONTACT DEALER</div>
                    <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>딜러 상담 신청</div>
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}><span style={S.gold}>{dealer?.name} {dealer?.title}</span>이 직접 연락드립니다.</div>
                    {selectedCar && (
                      <div style={{ background: "#0F0D08", border: `1px solid ${GOLD}33`, borderRadius: 12, padding: 14, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ fontSize: 28 }}>🏎️</span>
                        <div>
                          <div style={{ fontWeight: 700 }}>{selectedCar.model} {selectedCar.trim}</div>
                          <div style={{ fontSize: 11, color: "#666" }}>{selectedCar.year}년 · {(selectedCar.mileage / 10000).toFixed(1)}만km</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: GOLD, fontFamily: "'Cormorant Garamond'" }}>{selectedCar.price?.toLocaleString()}만원</div>
                        </div>
                      </div>
                    )}
                    {[{ label: "이름", key: "name", placeholder: "홍길동", type: "text" }, { label: "연락처", key: "phone", placeholder: "010-0000-0000", type: "tel" }].map(f => (
                      <div key={f.key} style={{ marginBottom: 12 }}>
                        <div style={S.label}>{f.label}</div>
                        <input type={f.type} placeholder={f.placeholder} value={inquiryForm[f.key]} onChange={e => setInquiryForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} />
                      </div>
                    ))}
                    <div style={{ marginBottom: 16 }}>
                      <div style={S.label}>문의 내용</div>
                      <textarea rows={4} placeholder="궁금한 점을 남겨주세요..." value={inquiryForm.message} onChange={e => setInquiryForm(p => ({ ...p, message: e.target.value }))} style={{ ...S.input, resize: "none" }} />
                    </div>
                    <button onClick={handleInquiry} disabled={inquiryLoading} className="tap" style={{ ...S.btn(true), opacity: inquiryLoading ? .6 : 1, marginBottom: 24 }}>{inquiryLoading ? "전송 중..." : "상담 신청하기"}</button>
                  </>
                ) : (
                  <div className="fadeUp" style={{ textAlign: "center", padding: "50px 0" }}>
                    <div style={{ fontSize: 52, marginBottom: 18 }}>✅</div>
                    <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 10 }}>REQUEST RECEIVED</div>
                    <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>문의가 접수됐습니다</div>
                    <div style={{ fontSize: 13, color: "#555", lineHeight: 1.7, marginBottom: 28 }}>{dealer?.name} {dealer?.title}이 <span style={S.gold}>{dealer?.mobile}</span>로<br />빠른 시간 내에 연락드립니다.</div>
                    <button onClick={() => setView("home")} style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: "#111", border: "1px solid #1C1C1C", color: "#888", fontSize: 13, fontFamily: "'Noto Sans KR'" }}>홈으로 돌아가기</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ 내 차 등록 (구매자) ══ */}
          {view === "mycar" && mode === "buyer" && (
            <div>
              {S.back(() => setView("home"))}
              <div style={{ padding: "0 20px" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 6 }}>SELL MY CAR</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>내 차 등록</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>등록 후 딜러 검수를 거쳐 매물로 공개됩니다.</div>
                <RegForm regStep={regStep} setRegStep={setRegStep} regForm={regForm} setRegForm={setRegForm} selectedOptions={selectedOptions} toggleOption={toggleOption} handleRegister={handleRegister} regLoading={regLoading} S={S} forBuyer />
              </div>
            </div>
          )}

          {/* ══ 차량 등록 (딜러) ══ */}
          {view === "register" && mode === "dealer" && (
            <div>
              {S.back(() => setView("home"))}
              <div style={{ padding: "0 20px" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 6 }}>VEHICLE REGISTRATION</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>차량 등록</div>
                <RegForm regStep={regStep} setRegStep={setRegStep} regForm={regForm} setRegForm={setRegForm} selectedOptions={selectedOptions} toggleOption={toggleOption} handleRegister={handleRegister} regLoading={regLoading} S={S} />
              </div>
            </div>
          )}

          {/* ══ 차량 수정 (딜러) ══ */}
          {view === "edit" && editCar && (
            <div>
              {S.back(() => setView("home"))}
              <div style={{ padding: "0 20px" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 6 }}>EDIT VEHICLE</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>차량 수정</div>
                {[
                  { label: "모델", key: "model" }, { label: "트림", key: "trim" },
                  { label: "연식", key: "year", type: "number" }, { label: "주행거리(km)", key: "mileage", type: "number" },
                  { label: "가격(만원)", key: "price", type: "number" },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <div style={S.label}>{f.label}</div>
                    <input type={f.type || "text"} value={editCar[f.key] || ""} onChange={e => setEditCar(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} />
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  {[
                    { label: "연료", key: "fuel", opts: ["가솔린", "디젤", "전기", "하이브리드"] },
                    { label: "변속기", key: "transmission", opts: ["자동", "수동"] },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={S.label}>{f.label}</div>
                      <select value={editCar[f.key]} onChange={e => setEditCar(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...S.input }}>
                        {f.opts.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={S.label}>차량 설명</div>
                  <textarea rows={4} value={editCar.description || ""} onChange={e => setEditCar(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, resize: "none" }} />
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <button onClick={() => { if (window.confirm("정말 삭제하시겠어요?")) handleDelete(editCar.id); }} style={{ flex: 1, padding: "13px 0", borderRadius: 10, background: "#1A0808", border: "1px solid #F03E3E33", color: "#F03E3E", fontSize: 13, fontFamily: "'Noto Sans KR'", fontWeight: 700 }}>🗑️ 삭제</button>
                  <button onClick={handleEdit} className="tap" style={{ flex: 2, ...S.btn() }}>수정 저장</button>
                </div>
              </div>
            </div>
          )}

        </>)}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...S.card, padding: 24, width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>차량을 삭제할까요?</div>
            <div style={{ fontSize: 13, color: "#777", marginBottom: 24 }}>삭제 후 복구가 불가능합니다.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#888", fontFamily: "'Noto Sans KR'" }}>취소</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: "#F03E3E", color: "#fff", fontFamily: "'Noto Sans KR'", fontWeight: 900 }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(16px)", borderTop: "1px solid #1A1A1A", display: "flex", justifyContent: "space-around", padding: "10px 0 16px", zIndex: 100 }}>
        {(mode === "buyer" ? [
          { icon: "🏠", label: "홈", id: "home" },
          { icon: "🔍", label: "검색", id: "list" },
          { icon: "🚗", label: "내차팔기", id: "mycar" },
          { icon: "❤️", label: `찜 ${favorites.length}`, id: "fav" },
        ] : [
          { icon: "📊", label: "대시보드", id: "home" },
          { icon: "🚗", label: "매물", id: "list" },
          { icon: "📬", label: `문의 ${inquiries.filter(i => i.status === "new").length}`, id: "dealer_inquiries" },
          { icon: "➕", label: "등록", id: "register" },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 12px" }}>
            <span style={{ fontSize: 19 }}>{tab.icon}</span>
            <span style={{ fontSize: 9, color: view === tab.id ? GOLD : "#444", fontFamily: "'Noto Sans KR'" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 등록 폼 컴포넌트 ──
function RegForm({ regStep, setRegStep, regForm, setRegForm, selectedOptions, toggleOption, handleRegister, regLoading, S, forBuyer }) {
  const GOLD = "#C9A84C";
  return (
    <>
      <div style={{ display: "flex", gap: 5, marginBottom: 24 }}>
        {[1, 2, 3, 4, 5].map(s => <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= regStep ? GOLD : "#1A1A1A", transition: "background .3s" }} />)}
      </div>

      {regStep === 1 && (
        <div className="fadeUp">
          {!forBuyer && (
            <div style={{ marginBottom: 18 }}>
              <div style={S.label}>등록 유형</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ val: "dealer", label: "딜러 직접" }, { val: "owner", label: "차주 위탁" }].map(opt => (
                  <button key={opt.val} onClick={() => setRegForm(f => ({ ...f, regBy: opt.val }))} style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: regForm.regBy === opt.val ? `${GOLD}11` : "#111", border: "1px solid", borderColor: regForm.regBy === opt.val ? GOLD : "#1C1C1C", color: regForm.regBy === opt.val ? GOLD : "#666", fontFamily: "'Noto Sans KR'", fontWeight: 700, fontSize: 13 }}>{opt.label}</button>
                ))}
              </div>
            </div>
          )}
          {[
            { label: "모델", key: "model", placeholder: "E300, C200..." },
            { label: "트림", key: "trim", placeholder: "아방가르드..." },
            { label: "연식", key: "year", placeholder: "2022", type: "number" },
            { label: "주행거리 (km)", key: "mileage", placeholder: "30000", type: "number" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <div style={S.label}>{f.label}</div>
              <input type={f.type || "text"} placeholder={f.placeholder} value={regForm[f.key]} onChange={e => setRegForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} />
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[{ label: "연료", key: "fuel", opts: ["가솔린", "디젤", "전기", "하이브리드"] }, { label: "변속기", key: "transmission", opts: ["자동", "수동"] }].map(f => (
              <div key={f.key}>
                <div style={S.label}>{f.label}</div>
                <select value={regForm[f.key]} onChange={e => setRegForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input}>
                  {f.opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {regStep === 2 && (
        <div className="fadeUp">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>옵션 선택</div>
          {["파노라마 선루프", "버메스터 사운드", "어댑티브 크루즈", "어라운드뷰", "HUD", "마사지 시트", "나이트비전", "열선시트", "통풍시트", "후방카메라"].map(opt => (
            <label key={opt} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", background: selectedOptions.includes(opt) ? `${GOLD}0A` : "#111", borderRadius: 8, marginBottom: 6, cursor: "pointer", border: `1px solid ${selectedOptions.includes(opt) ? `${GOLD}33` : "#1C1C1C"}` }}>
              <span style={{ fontSize: 13, color: selectedOptions.includes(opt) ? GOLD : "#CCC" }}>{opt}</span>
              <input type="checkbox" checked={selectedOptions.includes(opt)} onChange={() => toggleOption(opt)} style={{ width: 16, height: 16, accentColor: GOLD }} />
            </label>
          ))}
        </div>
      )}

      {regStep === 3 && (
        <div className="fadeUp">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>사고 이력</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["무사고", "사고 있음"].map(opt => (
              <button key={opt} onClick={() => setRegForm(f => ({ ...f, accidentFree: opt === "무사고" }))} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: (opt === "무사고") === regForm.accidentFree ? GOLD : "#111", border: "1px solid", borderColor: (opt === "무사고") === regForm.accidentFree ? GOLD : "#1C1C1C", color: (opt === "무사고") === regForm.accidentFree ? "#0A0A0A" : "#666", fontFamily: "'Noto Sans KR'", fontWeight: 700, fontSize: 13 }}>{opt}</button>
            ))}
          </div>
        </div>
      )}

      {regStep === 4 && (
        <div className="fadeUp">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>가격 / 설명</div>
          <div style={{ marginBottom: 14 }}>
            <div style={S.label}>판매 희망가 (만원)</div>
            <input type="number" placeholder="6800" value={regForm.price} onChange={e => setRegForm(p => ({ ...p, price: e.target.value }))} style={{ ...S.input, color: GOLD, fontSize: 24, fontWeight: 900, fontFamily: "'Cormorant Garamond'" }} />
          </div>
          <div style={S.label}>차량 설명</div>
          <textarea rows={5} placeholder="차량 상태, 관리 이력..." value={regForm.description} onChange={e => setRegForm(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, resize: "none" }} />
        </div>
      )}

      {regStep === 5 && (
        <div className="fadeUp" style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 50, marginBottom: 16 }}>🎉</div>
          <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: GOLD, letterSpacing: 3, marginBottom: 10 }}>SUBMITTED</div>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>등록 완료!</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.7 }}>딜러 검수 후 매물로 공개됩니다.</div>
        </div>
      )}

      {regStep < 5 && (
        <div style={{ display: "flex", gap: 10, marginTop: 24, paddingBottom: 24 }}>
          {regStep > 1 && <button onClick={() => setRegStep(s => s - 1)} style={{ flex: 1, padding: "13px 0", borderRadius: 12, background: "#111", border: "1px solid #1C1C1C", color: "#888", fontSize: 13, fontFamily: "'Noto Sans KR'" }}>이전</button>}
          <button onClick={regStep === 4 ? handleRegister : () => setRegStep(s => s + 1)} disabled={regLoading} className="tap" style={{ flex: 2, ...S.btn(), opacity: regLoading ? .6 : 1 }}>
            {regLoading ? "저장 중..." : regStep === 4 ? "등록 신청하기" : "다음"}
          </button>
        </div>
      )}
    </>
  );
}

function DealerCard({ dealer, compact }) {
  const GOLD = "#C9A84C";
  if (!dealer) return null;
  if (compact) return (
    <div style={{ background: "#0F0D08", border: `1px solid ${GOLD}33`, borderRadius: 12, padding: 14, marginBottom: 4 }}>
      <div style={{ fontSize: 10, color: GOLD, marginBottom: 8, letterSpacing: 1 }}>담당 딜러</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${GOLD}22`, border: `1px solid ${GOLD}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👔</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{dealer.name} {dealer.title}</div>
          <div style={{ fontSize: 10, color: "#666" }}>{dealer.mobile} · {dealer.email}</div>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ margin: "20px 20px 0", background: "#111", border: "1px solid #1E1A12", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg,#1A1508,#0F0D08)", borderBottom: "1px solid #1E1A12", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: `${GOLD}22`, border: `2px solid ${GOLD}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👔</div>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 17, fontWeight: 700 }}>{dealer.name_en}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{dealer.role} · {dealer.team}</div>
        </div>
      </div>
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 10, color: "#555", marginBottom: 8 }}>{dealer.company}</div>
        {[{ icon: "📍", val: dealer.address }, { icon: "📞", val: `T ${dealer.tel}  M ${dealer.mobile}` }, { icon: "✉️", val: dealer.email }].map(row => (
          <div key={row.val} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
            <span style={{ fontSize: 10, marginTop: 1 }}>{row.icon}</span>
            <span style={{ fontSize: 10, color: "#888", lineHeight: 1.5 }}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CarRow({ car, fav, onFav, onClick, delay = 0 }) {
  const GOLD = "#C9A84C";
  return (
    <div className="tap fadeUp" onClick={onClick} style={{ background: "#111", border: "1px solid #1C1C1C", borderRadius: 14, overflow: "hidden", cursor: "pointer", marginBottom: 12, animationDelay: `${delay}s` }}>
      <div style={{ height: 120, background: `linear-gradient(135deg, ${GOLD}18, #0A0A0A)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, position: "relative", borderBottom: "1px solid #161616" }}>
        🏎️
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 5 }}>
          {car.certified && <Badge text="공식인증" color={GOLD} />}
          {car.accident_free && <Badge text="무사고" color="#4CAF50" />}
          {car.reg_by === "owner" && <Badge text="차주등록" color="#748FFC" />}
          {car.status === "pending" && <Badge text="검수중" color="#F03E3E" />}
        </div>
        <button onClick={e => { e.stopPropagation(); onFav(); }} style={{ position: "absolute", top: 8, right: 8, fontSize: 18, background: "rgba(0,0,0,0.5)", width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {fav ? "❤️" : "🤍"}
        </button>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 9, color: `${GOLD}66`, letterSpacing: 2, marginBottom: 2 }}>MERCEDES-BENZ</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{car.model}</div>
          <div style={{ fontSize: 11, color: "#444", marginBottom: 5 }}>{car.trim}</div>
          <div style={{ fontSize: 11, color: "#555", display: "flex", gap: 5 }}>
            <span>{car.year}년</span><span>·</span><span>{(car.mileage / 10000).toFixed(1)}만km</span><span>·</span><span>{car.fuel}</span>
          </div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: GOLD, fontFamily: "'Cormorant Garamond'" }}>
          {car.price?.toLocaleString()}<span style={{ fontSize: 10, color: "#555", fontFamily: "'Noto Sans KR'" }}>만</span>
        </div>
      </div>
    </div>
  );
}

function Badge({ text, color }) {
  return <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}44` }}>{text}</span>;
}
