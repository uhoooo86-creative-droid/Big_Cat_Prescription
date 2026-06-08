// ================================================
// MOTORONE · Supabase 연동 버전
// 사용 전: 아래 두 줄을 실제 값으로 교체하세요
// ================================================

import { useState, useEffect } from "react";

const SUPABASE_URL = "https://lcnowfefkwtexkxtbazp.supabase.co/rest/v1/";   // ← 교체
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjbm93ZmVma3d0ZXhreHRiYXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTU0OTcsImV4cCI6MjA5NjQ5MTQ5N30.oj7F9Lm57pdvAm7hyXQ5pBn3VaFjP2_O6-o7QBIFH3I";                       // ← 교체

// ── 경량 Supabase 클라이언트 (SDK 없이 fetch만 사용) ──
const sb = {
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  },

  // SELECT
  async select(table, query = "") {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { ...this.headers, "Prefer": "return=representation" },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // INSERT
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.headers, "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // UPDATE
  async update(table, match, data) {
    const query = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join("&");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: { ...this.headers, "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Storage upload
  async uploadImage(bucket, path, file) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": file.type,
      },
      body: file,
    });
    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  },
};

// ── 데이터 로딩 함수들 ──
async function fetchApprovedCars() {
  // cars + options 함께 조회
  const cars = await sb.select("cars",
    "select=id,model,trim,year,mileage,fuel,transmission,price,description,accident_free,certified,reg_by,status,dealer_id&status=eq.approved&order=created_at.desc"
  );
  // 각 차량의 옵션 조회
  const withOptions = await Promise.all(cars.map(async car => {
    const opts = await sb.select("car_options", `select=option_name&car_id=eq.${car.id}`);
    return { ...car, options: opts.map(o => o.option_name) };
  }));
  return withOptions;
}

async function fetchPendingCars() {
  const cars = await sb.select("cars",
    "select=id,model,trim,year,mileage,fuel,transmission,price,description,accident_free,certified,reg_by,status,dealer_id&status=eq.pending&order=created_at.desc"
  );
  const withOptions = await Promise.all(cars.map(async car => {
    const opts = await sb.select("car_options", `select=option_name&car_id=eq.${car.id}`);
    return { ...car, options: opts.map(o => o.option_name) };
  }));
  return withOptions;
}

async function fetchDealer() {
  const dealers = await sb.select("dealers", "select=*&limit=1");
  return dealers[0];
}

async function submitInquiry({ carId, dealerId, buyerName, buyerPhone, message }) {
  return sb.insert("inquiries", {
    car_id: carId,
    dealer_id: dealerId,
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    message,
    status: "new",
  });
}

async function registerCar({ dealerId, form, options }) {
  // 1. cars 테이블에 삽입
  const [car] = await sb.insert("cars", {
    dealer_id: dealerId,
    brand: "Mercedes-Benz",
    model: form.model,
    trim: form.trim,
    year: parseInt(form.year),
    mileage: parseInt(form.mileage),
    fuel: form.fuel,
    transmission: form.transmission,
    price: parseInt(form.price),
    description: form.description,
    accident_free: form.accidentFree,
    reg_by: form.regBy,
    status: "pending",
  });

  // 2. car_options 삽입
  if (options.length > 0) {
    await sb.insert("car_options", options.map(name => ({
      car_id: car.id,
      option_name: name,
    })));
  }

  return car;
}

async function approveCar(carId) {
  return sb.update("cars", { id: carId }, { status: "approved" });
}

// ─────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const [mode, setMode] = useState("buyer");

  // DB 데이터
  const [dealer, setDealer] = useState(null);
  const [approvedCars, setApprovedCars] = useState([]);
  const [pendingCars, setPendingCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI 상태
  const [selectedCar, setSelectedCar] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inquiryDone, setInquiryDone] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ name: "", phone: "", message: "" });
  const [inquiryLoading, setInquiryLoading] = useState(false);

  // 등록 폼
  const [regStep, setRegStep] = useState(1);
  const [regForm, setRegForm] = useState({
    brand: "Mercedes-Benz", model: "", trim: "", year: "", mileage: "",
    fuel: "가솔린", transmission: "자동", price: "", description: "",
    accidentFree: true, regBy: "dealer",
  });
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [regLoading, setRegLoading] = useState(false);

  // ── 초기 데이터 로딩 ──
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, approved, pending] = await Promise.all([
        fetchDealer(),
        fetchApprovedCars(),
        fetchPendingCars(),
      ]);
      setDealer(d);
      setApprovedCars(approved);
      setPendingCars(pending);
    } catch (e) {
      setError("데이터를 불러오지 못했어요. Supabase URL/KEY를 확인해주세요.\n" + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const toggleFav = id => setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const toggleOption = opt => setSelectedOptions(o => o.includes(opt) ? o.filter(x => x !== opt) : [...o, opt]);

  const allCars = mode === "dealer" ? [...approvedCars, ...pendingCars] : approvedCars;
  const filtered = allCars.filter(c =>
    !searchQuery || `${c.model} ${c.trim}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── 문의 제출 ──
  const handleInquiry = async () => {
    if (!inquiryForm.name || !inquiryForm.phone) {
      alert("이름과 연락처를 입력해주세요.");
      return;
    }
    setInquiryLoading(true);
    try {
      await submitInquiry({
        carId: selectedCar.id,
        dealerId: dealer.id,
        buyerName: inquiryForm.name,
        buyerPhone: inquiryForm.phone,
        message: inquiryForm.message,
      });
      setInquiryDone(true);
    } catch (e) {
      alert("문의 접수 중 오류가 발생했습니다: " + e.message);
    } finally {
      setInquiryLoading(false);
    }
  };

  // ── 차량 등록 ──
  const handleRegister = async () => {
    if (!regForm.model || !regForm.year || !regForm.price) {
      alert("모델, 연식, 가격은 필수입니다.");
      return;
    }
    setRegLoading(true);
    try {
      await registerCar({ dealerId: dealer.id, form: regForm, options: selectedOptions });
      await loadData(); // 목록 새로고침
      setRegStep(5);    // 완료 화면
    } catch (e) {
      alert("등록 중 오류: " + e.message);
    } finally {
      setRegLoading(false);
    }
  };

  // ── 승인 처리 ──
  const handleApprove = async (carId) => {
    try {
      await approveCar(carId);
      await loadData(); // 새로고침
    } catch (e) {
      alert("승인 오류: " + e.message);
    }
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'Noto Sans KR', sans-serif",
      background: "#0A0A0A", minHeight: "100vh",
      color: "#F0EDE8", maxWidth: 430, margin: "0 auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Cormorant+Garamond:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; }
        input, select, textarea { outline: none; }
        button { cursor: pointer; border: none; background: none; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fadeUp { animation: fadeUp .4s ease both; }
        .tap { transition: transform .15s; }
        .tap:active { transform: scale(.97); }
      `}</style>

      {/* HEADER */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(10,10,10,0.96)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid #1C1C1C",
        padding: "14px 20px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div onClick={() => setView("home")} style={{ cursor: "pointer" }}>
          <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 22, fontWeight: 700, color: "#C9A84C", letterSpacing: 2 }}>MOTORONE</div>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 3 }}>MERCEDES-BENZ OFFICIAL DEALER</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* 실시간 연결 상태 */}
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: error ? "#F03E3E" : loading ? "#C9A84C" : "#4CAF50",
          }} title={error ? "연결 오류" : loading ? "로딩중" : "DB 연결됨"} />
          {["buyer","dealer"].map(m => (
            <button key={m} onClick={() => { setMode(m); setView("home"); }} style={{
              fontSize: 11, padding: "5px 12px", borderRadius: 4,
              fontFamily: "'Noto Sans KR'",
              background: mode === m ? "#C9A84C" : "#141414",
              color: mode === m ? "#0A0A0A" : "#666",
              border: "1px solid", borderColor: mode === m ? "#C9A84C" : "#222",
              fontWeight: mode === m ? 700 : 400, transition: "all .2s",
            }}>{m === "buyer" ? "구매자" : "딜러"}</button>
          ))}
        </div>
      </div>

      <div style={{ paddingBottom: 80 }}>

        {/* 로딩 */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{
              width: 32, height: 32, border: "3px solid #1C1C1C",
              borderTopColor: "#C9A84C", borderRadius: "50%",
              animation: "spin 1s linear infinite", margin: "0 auto 16px",
            }} />
            <div style={{ fontSize: 13, color: "#666" }}>Supabase에서 데이터 로딩중...</div>
          </div>
        )}

        {/* 오류 */}
        {!loading && error && (
          <div style={{ margin: 20, background: "#1A0808", border: "1px solid #F03E3E44", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#F03E3E", marginBottom: 8 }}>⚠️ 연결 오류</div>
            <div style={{ fontSize: 11, color: "#AA8888", lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>{error}</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>
              파일 상단 SUPABASE_URL과 SUPABASE_KEY를 실제 값으로 교체해주세요.
            </div>
            <button onClick={loadData} style={{
              background: "#C9A84C", color: "#0A0A0A", fontSize: 12,
              padding: "8px 16px", borderRadius: 8, fontWeight: 700,
              fontFamily: "'Noto Sans KR'",
            }}>다시 시도</button>
          </div>
        )}

        {!loading && !error && (
          <>

          {/* ══ HOME (BUYER) ══ */}
          {view === "home" && mode === "buyer" && (
            <div className="fadeUp">
              <div style={{ padding: "32px 24px 24px", borderBottom: "1px solid #1C1C1C" }}>
                <div style={{ fontFamily: "'Cormorant Garamond'", fontSize: 11, color: "#C9A84C", letterSpacing: 4, marginBottom: 10 }}>CERTIFIED PRE-OWNED</div>
                <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.25, marginBottom: 10 }}>
                  공식 딜러가 직접<br /><span style={{ color: "#C9A84C" }}>검증한 중고차</span>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>실시간 DB 연동 · 등록 즉시 반영</div>
                <div style={{
                  display: "flex", gap: 8,
                  background: "#111", border: "1px solid #1C1C1C",
                  borderRadius: 10, padding: "10px 14px", alignItems: "center",
                }}>
                  <span style={{ fontSize: 13, color: "#555" }}>🔍</span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && setView("list")}
                    placeholder="모델명 검색 (E300, GLC...)"
                    style={{ flex:1, background:"none", border:"none", color:"#F0EDE8", fontSize:14, fontFamily:"'Noto Sans KR'" }}
                  />
                  <button onClick={() => setView("list")} style={{
                    background: "#C9A84C", color: "#0A0A0A", fontSize: 12,
                    padding: "5px 14px", borderRadius: 6, fontFamily:"'Noto Sans KR'", fontWeight:700,
                  }}>검색</button>
                </div>
              </div>

              {dealer && <DealerCard dealer={dealer} />}

              <div style={{ padding: "20px 20px 8px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>
                    등록 매물
                    <span style={{ fontSize:11, color:"#C9A84C", marginLeft:8, fontFamily:"'Space Mono'" }}>{approvedCars.length}</span>
                  </div>
                  <button onClick={() => setView("list")} style={{ fontSize:12, color:"#C9A84C", fontFamily:"'Noto Sans KR'" }}>전체보기 →</button>
                </div>
                {approvedCars.map((car,i) => (
                  <CarRow key={car.id} car={car}
                    fav={favorites.includes(car.id)} onFav={() => toggleFav(car.id)}
                    onClick={() => { setSelectedCar(car); setView("detail"); }}
                    delay={i*0.07}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ══ HOME (DEALER) ══ */}
          {view === "home" && mode === "dealer" && (
            <div className="fadeUp">
              <div style={{ padding:"24px 20px 20px", borderBottom:"1px solid #1C1C1C" }}>
                <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:11, color:"#C9A84C", letterSpacing:3, marginBottom:8 }}>DEALER DASHBOARD</div>
                <div style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>
                  안녕하세요, <span style={{ color:"#C9A84C" }}>{dealer?.name} {dealer?.title}</span>님
                </div>
                <div style={{ fontSize:12, color:"#555" }}>{dealer?.team}</div>
              </div>

              {/* Stats */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, padding:"16px 20px 0" }}>
                {[
                  { label:"승인 매물", val:approvedCars.length, color:"#C9A84C" },
                  { label:"검수 대기", val:pendingCars.length, color:"#F03E3E" },
                  { label:"전체 등록", val:approvedCars.length + pendingCars.length, color:"#4CAF50" },
                ].map(s => (
                  <div key={s.label} style={{
                    background:"#111", border:"1px solid #1C1C1C",
                    borderRadius:12, padding:"14px 12px", textAlign:"center",
                  }}>
                    <div style={{ fontSize:26, fontWeight:900, color:s.color, fontFamily:"'Space Mono'" }}>{s.val}</div>
                    <div style={{ fontSize:10, color:"#555", marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Pending */}
              {pendingCars.length > 0 && (
                <div style={{ padding:"20px 20px 0" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#F03E3E", marginBottom:10 }}>
                    ● 검수 대기 차량
                  </div>
                  {pendingCars.map(car => (
                    <div key={car.id} style={{
                      background:"#111", border:"1px solid #F03E3E22",
                      borderRadius:12, padding:14, marginBottom:10,
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:14 }}>{car.model} {car.trim}</div>
                          <div style={{ fontSize:11, color:"#666" }}>
                            {car.year}년 · {(car.mileage/10000).toFixed(1)}만km ·
                            <span style={{ color:"#C9A84C", marginLeft:4 }}>
                              {car.reg_by === "owner" ? "차주 등록" : "딜러 등록"}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize:16, fontWeight:900, color:"#C9A84C", fontFamily:"'Space Mono'" }}>
                          {car.price?.toLocaleString()}만
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => handleApprove(car.id)} className="tap" style={{
                          flex:1, padding:"9px 0", borderRadius:8,
                          background:"#C9A84C", color:"#0A0A0A",
                          fontSize:13, fontWeight:900, fontFamily:"'Noto Sans KR'",
                        }}>✓ 승인 (DB 반영)</button>
                        <button style={{
                          flex:1, padding:"9px 0", borderRadius:8,
                          background:"#1A1A1A", border:"1px solid #222",
                          color:"#888", fontSize:13, fontFamily:"'Noto Sans KR'",
                        }}>✕ 반려</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approved */}
              <div style={{ padding:"20px 20px 0" }}>
                <div style={{ fontSize:12, color:"#555", marginBottom:10 }}>승인된 매물</div>
                {approvedCars.map((car,i) => (
                  <CarRow key={car.id} car={car} fav={false} onFav={()=>{}}
                    onClick={() => { setSelectedCar(car); setView("detail"); }}
                    delay={i*0.05} dealerMode
                  />
                ))}
              </div>

              <div style={{ padding:"20px 20px 0" }}>
                <button onClick={() => { setRegStep(1); setSelectedOptions([]); setView("register"); }} className="tap" style={{
                  width:"100%", padding:"16px 0", borderRadius:12,
                  background:"linear-gradient(135deg, #C9A84C, #A07830)",
                  color:"#0A0A0A", fontSize:15, fontWeight:900, fontFamily:"'Noto Sans KR'",
                }}>+ 새 차량 등록하기</button>
              </div>
            </div>
          )}

          {/* ══ LIST ══ */}
          {view === "list" && (
            <div className="fadeUp">
              <div style={{ padding:"14px 20px", borderBottom:"1px solid #1A1A1A" }}>
                <div style={{
                  display:"flex", gap:8, background:"#111",
                  border:"1px solid #1C1C1C", borderRadius:10,
                  padding:"8px 12px", alignItems:"center",
                }}>
                  <span style={{ fontSize:13, color:"#555" }}>🔍</span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="모델명 검색..."
                    style={{ flex:1, background:"none", border:"none", color:"#F0EDE8", fontSize:14, fontFamily:"'Noto Sans KR'" }}
                  />
                </div>
              </div>
              <div style={{ padding:"10px 20px 4px", fontSize:12, color:"#555" }}>
                총 <span style={{ color:"#C9A84C", fontWeight:700 }}>{filtered.length}</span>개 매물
              </div>
              <div style={{ padding:"8px 20px" }}>
                {filtered.map((car,i) => (
                  <CarRow key={car.id} car={car}
                    fav={favorites.includes(car.id)} onFav={() => toggleFav(car.id)}
                    onClick={() => { setSelectedCar(car); setView("detail"); }}
                    delay={i*0.06} dealerMode={mode==="dealer"}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ══ DETAIL ══ */}
          {view === "detail" && selectedCar && (
            <div>
              <button onClick={() => setView(mode==="dealer"?"home":"list")} style={{
                padding:"14px 20px", fontSize:13, color:"#666",
                display:"flex", alignItems:"center", gap:5, fontFamily:"'Noto Sans KR'",
              }}>← 돌아가기</button>

              <div style={{ margin:"0 20px", height:180, borderRadius:14,
                background:`linear-gradient(135deg, #C9A84C18, #0A0A0A)`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:72, border:"1px solid #C9A84C22", position:"relative",
              }}>
                🏎️
                <div style={{ position:"absolute", top:12, left:12, display:"flex", gap:6 }}>
                  {selectedCar.certified && <Badge text="공식인증" color="#C9A84C" />}
                  {selectedCar.accident_free && <Badge text="무사고" color="#4CAF50" />}
                  {selectedCar.reg_by === "owner" && <Badge text="차주등록" color="#748FFC" />}
                </div>
              </div>

              <div style={{ padding:"20px 20px 0" }}>
                <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:11, color:"#C9A84C", letterSpacing:3, marginBottom:4 }}>MERCEDES-BENZ</div>
                <div style={{ fontSize:24, fontWeight:900, marginBottom:2 }}>{selectedCar.model}</div>
                <div style={{ fontSize:13, color:"#555", marginBottom:12 }}>{selectedCar.trim}</div>
                <div style={{ fontSize:30, fontWeight:900, color:"#C9A84C", fontFamily:"'Cormorant Garamond'", marginBottom:18 }}>
                  {selectedCar.price?.toLocaleString()}<span style={{ fontSize:14, color:"#666", fontFamily:"'Noto Sans KR'" }}>만원</span>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
                  {[["연식",`${selectedCar.year}년`],["주행거리",`${(selectedCar.mileage/10000).toFixed(1)}만km`],["연료",selectedCar.fuel],["변속기",selectedCar.transmission]].map(([l,v]) => (
                    <div key={l} style={{ background:"#111", borderRadius:10, padding:"11px 13px", border:"1px solid #1C1C1C" }}>
                      <div style={{ fontSize:10, color:"#444", marginBottom:3 }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {selectedCar.options?.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:"#555", marginBottom:7 }}>주요 옵션</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {selectedCar.options.map(opt => (
                        <span key={opt} style={{ fontSize:11, background:"#111", border:"1px solid #C9A84C33", color:"#C9A84C88", padding:"4px 10px", borderRadius:5 }}>{opt}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCar.description && (
                  <div style={{ background:"#111", borderRadius:12, padding:15, border:"1px solid #1C1C1C", marginBottom:18 }}>
                    <div style={{ fontSize:11, color:"#444", marginBottom:6 }}>차량 설명</div>
                    <div style={{ fontSize:13, lineHeight:1.7, color:"#CCC" }}>{selectedCar.description}</div>
                  </div>
                )}

                {dealer && <DealerCard dealer={dealer} compact />}

                {mode === "buyer" && (
                  <div style={{ display:"flex", gap:10, paddingBottom:24, marginTop:16 }}>
                    <button onClick={() => toggleFav(selectedCar.id)} style={{
                      flex:1, padding:"13px 0", borderRadius:10,
                      background:"#111", border:"1px solid #222",
                      color:favorites.includes(selectedCar.id)?"#C9A84C":"#555",
                      fontSize:14, fontFamily:"'Noto Sans KR'", fontWeight:700,
                    }}>{favorites.includes(selectedCar.id)?"❤️ 찜됨":"🤍 찜"}</button>
                    <button onClick={() => { setInquiryDone(false); setInquiryForm({name:"",phone:"",message:""}); setView("inquiry"); }} className="tap" style={{
                      flex:2, padding:"13px 0", borderRadius:10,
                      background:"linear-gradient(135deg, #C9A84C, #A07830)",
                      color:"#0A0A0A", fontSize:14, fontWeight:900, fontFamily:"'Noto Sans KR'",
                    }}>딜러에게 문의하기</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ INQUIRY ══ */}
          {view === "inquiry" && (
            <div>
              <button onClick={() => setView("detail")} style={{
                padding:"14px 20px", fontSize:13, color:"#666",
                display:"flex", alignItems:"center", gap:5, fontFamily:"'Noto Sans KR'",
              }}>← 차량 정보</button>

              <div style={{ padding:"0 20px" }}>
                {!inquiryDone ? (
                  <>
                    <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:11, color:"#C9A84C", letterSpacing:3, marginBottom:6 }}>CONTACT DEALER</div>
                    <div style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>딜러 상담 신청</div>
                    <div style={{ fontSize:12, color:"#555", marginBottom:20 }}>
                      문의를 남기면 <span style={{ color:"#C9A84C" }}>{dealer?.name} {dealer?.title}</span>이 직접 연락드립니다.
                    </div>

                    {selectedCar && (
                      <div style={{ background:"#0F0D08", border:"1px solid #C9A84C33", borderRadius:12, padding:14, marginBottom:20, display:"flex", gap:12, alignItems:"center" }}>
                        <span style={{ fontSize:28 }}>🏎️</span>
                        <div>
                          <div style={{ fontWeight:700 }}>{selectedCar.model} {selectedCar.trim}</div>
                          <div style={{ fontSize:11, color:"#666" }}>{selectedCar.year}년 · {(selectedCar.mileage/10000).toFixed(1)}만km</div>
                          <div style={{ fontSize:16, fontWeight:900, color:"#C9A84C", fontFamily:"'Cormorant Garamond'" }}>{selectedCar.price?.toLocaleString()}만원</div>
                        </div>
                      </div>
                    )}

                    {[
                      { label:"이름", key:"name", placeholder:"홍길동", type:"text" },
                      { label:"연락처", key:"phone", placeholder:"010-0000-0000", type:"tel" },
                    ].map(f => (
                      <div key={f.key} style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>{f.label}</div>
                        <input type={f.type} placeholder={f.placeholder}
                          value={inquiryForm[f.key]}
                          onChange={e => setInquiryForm(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width:"100%", background:"#111", border:"1px solid #1C1C1C", borderRadius:10, padding:"12px 14px", color:"#F0EDE8", fontSize:14, fontFamily:"'Noto Sans KR'" }}
                        />
                      </div>
                    ))}

                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>문의 내용</div>
                      <textarea rows={4} placeholder="궁금한 점을 남겨주세요..."
                        value={inquiryForm.message}
                        onChange={e => setInquiryForm(p => ({ ...p, message: e.target.value }))}
                        style={{ width:"100%", background:"#111", border:"1px solid #1C1C1C", borderRadius:10, padding:"12px 14px", color:"#F0EDE8", fontSize:14, fontFamily:"'Noto Sans KR'", resize:"none" }}
                      />
                    </div>

                    <div style={{ background:"#111", border:"1px solid #1C1C1C", borderRadius:10, padding:"10px 14px", marginBottom:20, fontSize:11, color:"#555" }}>
                      ✅ 문의 내용이 Supabase DB에 저장되며 담당 딜러에게 자동 전달됩니다.
                    </div>

                    <button onClick={handleInquiry} disabled={inquiryLoading} className="tap" style={{
                      width:"100%", padding:"15px 0", borderRadius:12,
                      background:inquiryLoading?"#888":"linear-gradient(135deg, #C9A84C, #A07830)",
                      color:"#0A0A0A", fontSize:15, fontWeight:900, fontFamily:"'Noto Sans KR'",
                    }}>{inquiryLoading ? "전송 중..." : "상담 신청하기"}</button>
                  </>
                ) : (
                  <div className="fadeUp" style={{ textAlign:"center", padding:"50px 0" }}>
                    <div style={{ fontSize:52, marginBottom:18 }}>✅</div>
                    <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:11, color:"#C9A84C", letterSpacing:3, marginBottom:10 }}>SAVED TO DATABASE</div>
                    <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>문의가 접수됐습니다</div>
                    <div style={{ fontSize:13, color:"#555", lineHeight:1.7, marginBottom:28 }}>
                      {dealer?.name} {dealer?.title}이 <span style={{ color:"#C9A84C" }}>{dealer?.mobile}</span>로<br />빠른 시간 내에 연락드립니다.
                    </div>
                    <button onClick={() => setView("home")} style={{
                      width:"100%", padding:"13px 0", borderRadius:12,
                      background:"#111", border:"1px solid #1C1C1C",
                      color:"#888", fontSize:13, fontFamily:"'Noto Sans KR'",
                    }}>홈으로 돌아가기</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ REGISTER ══ */}
          {view === "register" && (
            <div>
              <button onClick={() => setView("home")} style={{
                padding:"14px 20px", fontSize:13, color:"#666",
                display:"flex", alignItems:"center", gap:5, fontFamily:"'Noto Sans KR'",
              }}>← 취소</button>

              <div style={{ padding:"0 20px" }}>
                <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:11, color:"#C9A84C", letterSpacing:3, marginBottom:6 }}>VEHICLE REGISTRATION</div>
                <div style={{ fontSize:18, fontWeight:900, marginBottom:18 }}>차량 등록</div>

                {/* Step bar */}
                <div style={{ display:"flex", gap:5, marginBottom:24 }}>
                  {[1,2,3,4,5].map(s => (
                    <div key={s} style={{ flex:1, height:3, borderRadius:2, background: s<=regStep?"#C9A84C":"#1A1A1A", transition:"background .3s" }} />
                  ))}
                </div>

                {regStep === 1 && (
                  <div className="fadeUp">
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>1단계 · 등록 유형</div>
                    <div style={{ display:"flex", gap:8, marginBottom:18 }}>
                      {[{val:"dealer",label:"딜러 직접 등록"},{val:"owner",label:"차주 위탁 등록"}].map(opt => (
                        <button key={opt.val} onClick={() => setRegForm(f=>({...f,regBy:opt.val}))} style={{
                          flex:1, padding:"13px 10px", borderRadius:10,
                          background: regForm.regBy===opt.val?"#C9A84C11":"#111",
                          border:"1px solid", borderColor: regForm.regBy===opt.val?"#C9A84C":"#1C1C1C",
                          color: regForm.regBy===opt.val?"#C9A84C":"#666",
                          fontFamily:"'Noto Sans KR'", fontWeight:700, fontSize:13,
                        }}>{opt.label}</button>
                      ))}
                    </div>
                    {[
                      {label:"모델",key:"model",placeholder:"E300, C200, GLC300..."},
                      {label:"트림",key:"trim",placeholder:"아방가르드, AMG Line..."},
                      {label:"연식",key:"year",placeholder:"2022",type:"number"},
                      {label:"주행거리 (km)",key:"mileage",placeholder:"30000",type:"number"},
                    ].map(f => (
                      <div key={f.key} style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>{f.label}</div>
                        <input type={f.type||"text"} placeholder={f.placeholder}
                          value={regForm[f.key]}
                          onChange={e => setRegForm(p=>({...p,[f.key]:e.target.value}))}
                          style={{ width:"100%", background:"#111", border:"1px solid #1C1C1C", borderRadius:10, padding:"11px 13px", color:"#F0EDE8", fontSize:14, fontFamily:"'Noto Sans KR'" }}
                        />
                      </div>
                    ))}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      {[
                        {label:"연료",key:"fuel",opts:["가솔린","디젤","전기","플러그인하이브리드"]},
                        {label:"변속기",key:"transmission",opts:["자동","수동"]},
                      ].map(f => (
                        <div key={f.key}>
                          <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>{f.label}</div>
                          <select value={regForm[f.key]} onChange={e=>setRegForm(p=>({...p,[f.key]:e.target.value}))} style={{
                            width:"100%", background:"#111", border:"1px solid #1C1C1C", borderRadius:10,
                            padding:"11px 13px", color:"#F0EDE8", fontSize:13, fontFamily:"'Noto Sans KR'",
                          }}>
                            {f.opts.map(o=><option key={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {regStep === 2 && (
                  <div className="fadeUp">
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>2단계 · 옵션 선택</div>
                    {["파노라마 선루프","버메스터 사운드","어댑티브 크루즈","어라운드뷰","HUD","마사지 시트","나이트비전","열선시트","통풍시트","후방카메라"].map(opt => (
                      <label key={opt} style={{
                        display:"flex", justifyContent:"space-between", alignItems:"center",
                        padding:"11px 13px", background: selectedOptions.includes(opt)?"#C9A84C0A":"#111",
                        borderRadius:8, marginBottom:6, cursor:"pointer",
                        border:`1px solid ${selectedOptions.includes(opt)?"#C9A84C33":"#1C1C1C"}`,
                      }}>
                        <span style={{ fontSize:13, color: selectedOptions.includes(opt)?"#C9A84C":"#CCC" }}>{opt}</span>
                        <input type="checkbox" checked={selectedOptions.includes(opt)}
                          onChange={() => toggleOption(opt)}
                          style={{ width:16, height:16, accentColor:"#C9A84C" }}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {regStep === 3 && (
                  <div className="fadeUp">
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>3단계 · 사고 이력</div>
                    <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                      {["무사고","사고 있음"].map(opt => (
                        <button key={opt} onClick={() => setRegForm(f=>({...f,accidentFree:opt==="무사고"}))} style={{
                          flex:1, padding:"12px 0", borderRadius:10,
                          background:(opt==="무사고")===regForm.accidentFree?"#C9A84C":"#111",
                          border:"1px solid", borderColor:(opt==="무사고")===regForm.accidentFree?"#C9A84C":"#1C1C1C",
                          color:(opt==="무사고")===regForm.accidentFree?"#0A0A0A":"#666",
                          fontFamily:"'Noto Sans KR'", fontWeight:700, fontSize:13,
                        }}>{opt}</button>
                      ))}
                    </div>
                  </div>
                )}

                {regStep === 4 && (
                  <div className="fadeUp">
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>4단계 · 가격 / 설명</div>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>판매 희망가 (만원)</div>
                      <input type="number" placeholder="6800"
                        value={regForm.price} onChange={e=>setRegForm(p=>({...p,price:e.target.value}))}
                        style={{ width:"100%", background:"#111", border:"1px solid #1C1C1C", borderRadius:10, padding:"14px", color:"#C9A84C", fontSize:26, fontWeight:900, fontFamily:"'Cormorant Garamond'" }}
                      />
                    </div>
                    <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>차량 설명</div>
                    <textarea rows={5} placeholder="차량 상태, 관리 이력..."
                      value={regForm.description} onChange={e=>setRegForm(p=>({...p,description:e.target.value}))}
                      style={{ width:"100%", background:"#111", border:"1px solid #1C1C1C", borderRadius:10, padding:"12px 14px", color:"#F0EDE8", fontSize:14, fontFamily:"'Noto Sans KR'", resize:"none" }}
                    />
                  </div>
                )}

                {regStep === 5 && (
                  <div className="fadeUp" style={{ textAlign:"center", padding:"20px 0" }}>
                    <div style={{ fontSize:50, marginBottom:16 }}>🎉</div>
                    <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:11, color:"#C9A84C", letterSpacing:3, marginBottom:10 }}>SAVED TO DATABASE</div>
                    <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>DB에 저장됐습니다</div>
                    <div style={{ fontSize:13, color:"#555", lineHeight:1.7, marginBottom:28 }}>
                      검수 대기 상태로 저장됐어요.<br />대시보드에서 승인하면 즉시 공개됩니다.
                    </div>
                    <button onClick={() => { setView("home"); setRegStep(1); }} className="tap" style={{
                      width:"100%", padding:"14px 0", borderRadius:12,
                      background:"linear-gradient(135deg, #C9A84C, #A07830)",
                      color:"#0A0A0A", fontSize:14, fontWeight:900, fontFamily:"'Noto Sans KR'",
                    }}>대시보드에서 확인하기</button>
                  </div>
                )}

                {regStep < 5 && (
                  <div style={{ display:"flex", gap:10, marginTop:24, paddingBottom:24 }}>
                    {regStep > 1 && (
                      <button onClick={() => setRegStep(s=>s-1)} style={{
                        flex:1, padding:"13px 0", borderRadius:12,
                        background:"#111", border:"1px solid #1C1C1C",
                        color:"#888", fontSize:13, fontFamily:"'Noto Sans KR'",
                      }}>이전</button>
                    )}
                    <button
                      onClick={regStep===4 ? handleRegister : () => setRegStep(s=>s+1)}
                      disabled={regLoading} className="tap"
                      style={{
                        flex:2, padding:"13px 0", borderRadius:12,
                        background:regLoading?"#888":"linear-gradient(135deg, #C9A84C, #A07830)",
                        color:"#0A0A0A", fontSize:14, fontWeight:900, fontFamily:"'Noto Sans KR'",
                      }}>
                      {regLoading ? "저장 중..." : regStep===4 ? "DB에 저장하기" : "다음"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          </>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"rgba(10,10,10,0.97)", backdropFilter:"blur(16px)",
        borderTop:"1px solid #1A1A1A",
        display:"flex", justifyContent:"space-around",
        padding:"10px 0 16px", zIndex:100,
      }}>
        {(mode==="buyer"?[
          {icon:"🏠",label:"홈",id:"home"},
          {icon:"🔍",label:"검색",id:"list"},
          {icon:"❤️",label:`찜 ${favorites.length}`,id:"fav"},
        ]:[
          {icon:"📊",label:"대시보드",id:"home"},
          {icon:"🚗",label:"매물",id:"list"},
          {icon:"➕",label:"등록",id:"register"},
        ]).map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"4px 20px",
          }}>
            <span style={{ fontSize:19 }}>{tab.icon}</span>
            <span style={{ fontSize:9, color:view===tab.id?"#C9A84C":"#444", fontFamily:"'Noto Sans KR'" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ──
function DealerCard({ dealer, compact }) {
  if (!dealer) return null;
  if (compact) return (
    <div style={{ background:"#0F0D08", border:"1px solid #C9A84C33", borderRadius:12, padding:14, marginBottom:4 }}>
      <div style={{ fontSize:10, color:"#C9A84C", marginBottom:8, letterSpacing:1 }}>담당 딜러</div>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <div style={{ width:36,height:36,borderRadius:"50%",background:"#C9A84C22",border:"1px solid #C9A84C44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16 }}>👔</div>
        <div>
          <div style={{ fontWeight:700, fontSize:13 }}>{dealer.name} {dealer.title}</div>
          <div style={{ fontSize:10, color:"#666" }}>{dealer.mobile} · {dealer.email}</div>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ margin:"20px 20px 0", background:"#111", border:"1px solid #1E1A12", borderRadius:14, overflow:"hidden" }}>
      <div style={{ background:"linear-gradient(135deg,#1A1508,#0F0D08)", borderBottom:"1px solid #1E1A12", padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:48,height:48,borderRadius:"50%",background:"#C9A84C22",border:"2px solid #C9A84C44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>👔</div>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:17, fontWeight:700, color:"#F0EDE8" }}>{dealer.name_en}</div>
          <div style={{ fontSize:11, color:"#888" }}>{dealer.role} · {dealer.team}</div>
        </div>
      </div>
      <div style={{ padding:"12px 16px" }}>
        <div style={{ fontSize:10, color:"#555", marginBottom:8 }}>{dealer.company}</div>
        {[
          {icon:"📍",val:dealer.address},
          {icon:"📞",val:`T ${dealer.tel}  M ${dealer.mobile}`},
          {icon:"✉️",val:dealer.email},
        ].map(row => (
          <div key={row.val} style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:5 }}>
            <span style={{ fontSize:10, marginTop:1 }}>{row.icon}</span>
            <span style={{ fontSize:10, color:"#888", lineHeight:1.5 }}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CarRow({ car, fav, onFav, onClick, delay=0, dealerMode=false }) {
  return (
    <div className="tap fadeUp" onClick={onClick} style={{
      background:"#111", border:"1px solid #1C1C1C",
      borderRadius:14, overflow:"hidden", cursor:"pointer",
      marginBottom:12, animationDelay:`${delay}s`,
    }}>
      <div style={{
        height:120, background:"linear-gradient(135deg, #C9A84C18, #0A0A0A)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:56, position:"relative", borderBottom:"1px solid #161616",
      }}>
        🏎️
        <div style={{ position:"absolute", top:8, left:8, display:"flex", gap:5 }}>
          {car.certified && <Badge text="공식인증" color="#C9A84C" />}
          {car.accident_free && <Badge text="무사고" color="#4CAF50" />}
          {car.status==="pending" && <Badge text="검수중" color="#F03E3E" />}
          {car.reg_by==="owner" && dealerMode && <Badge text="차주등록" color="#748FFC" />}
        </div>
        <button onClick={e=>{e.stopPropagation();onFav();}} style={{
          position:"absolute", top:8, right:8, fontSize:18,
          background:"rgba(0,0,0,0.5)", width:30, height:30,
          borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
        }}>{fav?"❤️":"🤍"}</button>
      </div>
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond'", fontSize:9, color:"#C9A84C66", letterSpacing:2, marginBottom:2 }}>MERCEDES-BENZ</div>
            <div style={{ fontSize:15, fontWeight:700 }}>{car.model}</div>
            <div style={{ fontSize:11, color:"#444", marginBottom:5 }}>{car.trim}</div>
            <div style={{ fontSize:11, color:"#555", display:"flex", gap:5 }}>
              <span>{car.year}년</span><span>·</span>
              <span>{(car.mileage/10000).toFixed(1)}만km</span><span>·</span>
              <span>{car.fuel}</span>
            </div>
          </div>
          <div style={{ fontSize:19, fontWeight:700, color:"#C9A84C", fontFamily:"'Cormorant Garamond'" }}>
            {car.price?.toLocaleString()}<span style={{ fontSize:10, color:"#555", fontFamily:"'Noto Sans KR'" }}>만</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ text, color }) {
  return (
    <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:`${color}22`, color, border:`1px solid ${color}44` }}>
      {text}
    </span>
  );
}
