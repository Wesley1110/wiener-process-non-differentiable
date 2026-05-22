import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ZoomIn, ZoomOut, RefreshCw, Eye, Sliders, Activity, TrendingUp } from "lucide-react";

const App = () => {
  // ---------------------------------------------------------------------------
  // 自動注入 Tailwind CSS (確保在獨立環境中格式完美)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!document.querySelector('script[src*="tailwindcss.com"]')) {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 狀態管理：核心隨機數據與財務參數
  // ---------------------------------------------------------------------------
  const pointsRef = useRef([]); 
  const [version, setVersion] = useState(0); 
  const [viewWindow, setViewWindow] = useState({ start: 0, end: 1 });
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // 財務參數狀態
  const [isGBM, setIsGBM] = useState(false);
  const [mu, setMu] = useState(0.15);         // 漂移率 (Drift)
  const [sigma, setSigma] = useState(0.30);    // 波動度 (Volatility)
  const [initialPrice, setInitialPrice] = useState(100);
  const [showBands, setShowBands] = useState(true);

  // 拖拽平移 (Pan) 相關狀態
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, start: 0, end: 1 });

  // 初始化基礎維納過程路徑：W(0)=0, W(1)~N(0,1)
  const initData = () => {
    const pStart = { t: 0, y: 0 };
    const u1 = Math.random() || 0.0001;
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const pEnd = { t: 1, y: z }; 
    
    pointsRef.current = [pStart, pEnd];
    setVersion(v => v + 1);
    setViewWindow({ start: 0, end: 1 });
  };

  useEffect(() => {
    initData();
  }, []);

  // ---------------------------------------------------------------------------
  // 碎形演算法：布朗橋動態細分 (Brownian Bridge Midpoint Displacement)
  // ---------------------------------------------------------------------------
  const refinePoints = () => {
    if (!containerRef.current) return;
    
    const width = containerRef.current.clientWidth || 800;
    const points = pointsRef.current;
    
    const timeSpan = viewWindow.end - viewWindow.start;
    const pixelToTime = timeSpan / width;
    const maxGapT = pixelToTime * 4; // 提高分辨率到 4 像素

    // 二分搜尋法定位當前可視窗口的起點
    let startIndex = 0;
    let low = 0, high = points.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (points[mid].t < viewWindow.start) {
        startIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    let added = false;
    for (let i = startIndex; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];

      if (p1.t > viewWindow.end) break;

      const dt = p2.t - p1.t;
      if (dt > maxGapT) {
        const midT = p1.t + dt / 2;
        const midMean = (p1.y + p2.y) / 2;
        const stdDev = Math.sqrt(dt) / 2; // 布朗橋中點精確變異數為 dt/4
        
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        
        const midY = midMean + z * stdDev;

        points.splice(i + 1, 0, { t: midT, y: midY });
        added = true;
        i++; 
      }
    }

    if (added) {
      setVersion(v => v + 1);
    }
  };

  useEffect(() => {
    const timer = setTimeout(refinePoints, 8);
    return () => clearTimeout(timer);
  }, [viewWindow, version]);

  // ---------------------------------------------------------------------------
  // 圖表尺寸監聽
  // ---------------------------------------------------------------------------
  const [dimensions, setDimensions] = useState({ width: 800, height: 420 });
  useEffect(() => {
    if (svgRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      });
      resizeObserver.observe(svgRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [svgRef]);

  // ---------------------------------------------------------------------------
  // 核心數據計算：映射、邊界、統計邊界、微觀斜率
  // ---------------------------------------------------------------------------
  const chartData = useMemo(() => {
    const rawPoints = pointsRef.current;
    if (rawPoints.length < 2) return { pathD: "", bandsD: "", ticksX: [], ticksY: [], localSlope: 0, currentScale: 1 };

    // 1. 根據目前模式 (Wiener 或是 GBM) 將原始路徑進行動態數學映射
    const mappedPoints = rawPoints.map(p => {
      if (!isGBM) return { t: p.t, y: p.y };
      // Geometric Brownian Motion formula: S_t = S_0 * exp((mu - 0.5*sigma^2)*t + sigma * W_t)
      const gbmY = initialPrice * Math.exp((mu - 0.5 * Math.pow(sigma, 2)) * p.t + sigma * p.y);
      return { t: p.t, y: gbmY };
    });

    // 2. 篩選當前可視窗口內的點，並找出 Y 軸的最大/最小值
    const visiblePoints = [];
    let min = Infinity, max = -Infinity;

    for (let i = 0; i < mappedPoints.length; i++) {
      const p = mappedPoints[i];
      if (p.t >= viewWindow.start && p.t <= viewWindow.end) {
        visiblePoints.push(p);
        if (p.y < min) min = p.y;
        if (p.y > max) max = p.y;
      } else if (p.t < viewWindow.start) {
        if (i === mappedPoints.length - 1 || mappedPoints[i+1].t >= viewWindow.start) {
          visiblePoints.push(p);
        }
      } else if (p.t > viewWindow.end) {
        visiblePoints.push(p);
        break; 
      }
    }

    if (visiblePoints.length < 2) return { pathD: "", bandsD: "", ticksX: [], ticksY: [], localSlope: 0, currentScale: 1 };

    // 給予上下邊界適度緩衝 (Padding)
    const padding = (max - min) * 0.15 || 0.1;
    min -= padding;
    max += padding;

    const { width, height } = dimensions;
    const timeRange = viewWindow.end - viewWindow.start;
    const valRange = max - min;

    // 3. 構造主路徑 SVG D 字串
    let pathD = "";
    visiblePoints.forEach((p, i) => {
      const x = ((p.t - viewWindow.start) / timeRange) * width;
      const y = height - ((p.y - min) / valRange) * height;
      if (i === 0) pathD += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      else pathD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    // 4. 計算統計邊界（95% 信心區間）封套路徑
    let bandsD = "";
    if (showBands && visiblePoints.length > 1) {
      let upperPoints = [];
      let lowerPoints = [];
      
      // 在可視區間內均勻取點計算理論擴存邊界
      const sampleCount = 40;
      for (let k = 0; k <= sampleCount; k++) {
        const t = viewWindow.start + (timeRange * k) / sampleCount;
        if (t === 0) {
          const yZero = isGBM ? initialPrice : 0;
          upperPoints.push({ t, y: yZero });
          lowerPoints.unshift({ t, y: yZero });
          continue;
        }
        
        let uY, lY;
        if (!isGBM) {
          // Standard Wiener Bound: \pm 2 * \sqrt{t}
          const bound = 2 * Math.sqrt(t);
          uY = bound;
          lY = -bound;
        } else {
          // GBM Confidence Bounds: S_0 * exp(mu*t \pm 2*sigma*\sqrt{t})
          uY = initialPrice * Math.exp(mu * t + 2 * sigma * Math.sqrt(t));
          lY = initialPrice * Math.exp(mu * t - 2 * sigma * Math.sqrt(t));
        }
        upperPoints.push({ t, y: uY });
        lowerPoints.unshift({ t, y: lY });
      }

      const combinedBands = [...upperPoints, ...lowerPoints];
      combinedBands.forEach((p, i) => {
        const x = ((p.t - viewWindow.start) / timeRange) * width;
        let yVal = Math.max(min, Math.min(max, p.y));
        const y = height - ((yVal - min) / valRange) * height;
        if (i === 0) bandsD += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
        else bandsD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      bandsD += " Z";
    }

    // 5. 即時計算窗口正中央的「微觀斜率」Delta Y / Delta T (見證不可微)
    let localSlope = 0;
    const midIndex = Math.floor(visiblePoints.length / 2);
    if (midIndex > 0 && midIndex < visiblePoints.length - 1) {
      const pLeft = visiblePoints[midIndex];
      const pRight = visiblePoints[midIndex + 1];
      const dt = pRight.t - pLeft.t;
      if (dt > 0) {
        localSlope = (pRight.y - pLeft.y) / dt;
      }
    }

    // 6. 生成動態雙軸坐標刻度
    const ticksX = Array.from({ length: 5 }).map((_, i) => {
      const t = viewWindow.start + (timeRange * i) / 4;
      return { x: (i * width) / 4, label: t.toFixed(Math.max(2, -Math.log10(timeRange) + 2)) };
    });

    const ticksY = Array.from({ length: 5 }).map((_, i) => {
      const val = min + (valRange * i) / 4;
      return { y: height - (i * height) / 4, label: val.toFixed(isGBM ? 2 : 3) };
    });

    return { pathD, bandsD, ticksX, ticksY, localSlope, currentScale: 1 / timeRange };
  }, [version, viewWindow, dimensions, isGBM, mu, sigma, initialPrice, showBands]);

  // ---------------------------------------------------------------------------
  // 縮放與拖拽互動邏輯 (Zoom & Pan)
  // ---------------------------------------------------------------------------
  const doZoom = (factor, mouseClientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = mouseClientX - rect.left;
    const width = rect.width;
    
    const currentSpan = viewWindow.end - viewWindow.start;
    const clickT = viewWindow.start + (clickX / width) * currentSpan;

    const newSpan = currentSpan * factor;
    let newStart = clickT - newSpan * (clickX / width);
    let newEnd = newStart + newSpan;

    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; }
    if (newEnd - newStart > 1) { newStart = 0; newEnd = 1; }

    setViewWindow({ start: newStart, end: newEnd });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 1.15 : 0.85;
    doZoom(scaleFactor, e.clientX);
  };

  // 拖拽平移 (Pan) 實作
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // 僅限滑鼠左鍵
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      start: viewWindow.start,
      end: viewWindow.end
    };
    if (svgRef.current) svgRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStart.current.x;
    const currentSpan = dragStart.current.end - dragStart.current.start;
    
    // 將像素位移轉換為時間軸位移 Delta T
    const deltaT = (deltaX / rect.width) * currentSpan;
    
    let newStart = dragStart.current.start - deltaT;
    let newEnd = dragStart.current.end - deltaT;

    // 邊界碰撞檢查
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; }

    setViewWindow({ start: Math.max(0, newStart), end: Math.min(1, newEnd) });
  };

  const handleMouseUpOrLeave = () => {
    isDragging.current = false;
    if (svgRef.current) svgRef.current.style.cursor = 'crosshair';
  };

  // ---------------------------------------------------------------------------
  // UI 渲染
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 font-sans bg-slate-900 text-slate-100 min-h-screen selection:bg-emerald-500 selection:text-black">
      
      {/* 標頭儀表板 */}
      <header className="mb-6 border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold tracking-widest uppercase bg-emerald-500/10 px-2.5 py-1 rounded-full w-fit mb-2">
            <Activity className="w-3.5 h-3.5 animate-pulse" /> Advanced Financial Analytics
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            維納過程與隨機分析視覺化實驗室
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            動態布朗橋碎形構造模型：驗證資產價格之「處處不可微分」與「無限變異」性質。
          </p>
        </div>

        {/* 快速切換器 */}
        <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 flex gap-1 h-fit w-fit self-end md:self-center">
          <button 
            onClick={() => { setIsGBM(false); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${!isGBM ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            標準維納過程 W(t)
          </button>
          <button 
            onClick={() => { setIsGBM(true); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${isGBM ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            幾何布朗運動 S(t)
          </button>
        </div>
      </header>

      {/* 主工作區：左側圖表，右側控制台 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* 左側：核心模擬圖表 */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          
          {/* 量化監測數據條 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 font-mono text-xs">
            <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800">
              <span className="text-slate-500 block mb-0.5">時間窗口 (Time Window)</span>
              <span className="text-slate-200 font-semibold">[{viewWindow.start.toFixed(4)}, {viewWindow.end.toFixed(4)}]</span>
            </div>
            <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800">
              <span className="text-slate-500 block mb-0.5">放大倍率 (Zoom Scale)</span>
              <span className="text-emerald-400 font-bold">{chartData.currentScale.toExponential(2)}x</span>
            </div>
            <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800 col-span-2 overflow-hidden">
              <span className="text-slate-500 block mb-0.5">中央微觀斜率 (Local Slope: ΔY/ΔT)</span>
              <span className={`font-bold transition-all truncate block ${Math.abs(chartData.localSlope) > 1000 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                {chartData.localSlope === 0 ? "Computing..." : chartData.localSlope.toLocaleString(undefined, {maximumFractionDigits:2})}
              </span>
            </div>
          </div>

          {/* SVG 圖表容器 */}
          <div 
            ref={containerRef}
            className="h-[440px] w-full border border-slate-800 bg-slate-950 rounded-xl overflow-hidden shadow-2xl relative select-none"
          >
            {/* 圖表背景浮水印刻度 */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-slate-800/60">
              <h2 className="text-slate-300 font-bold text-xs tracking-wider uppercase">
                {isGBM ? "Geometric Brownian Motion Simulation" : "Wiener Process Simulation"}
              </h2>
            </div>

            {/* 畫布 */}
            <div 
              ref={svgRef}
              className="w-full h-full relative cursor-crosshair"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
            >
              <svg width="100%" height="100%" className="overflow-visible">
                {/* 背景網格網 */}
                <defs>
                  <pattern id="grid-pattern" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                
                {/* 1. 繪製理論統計信心包絡帶 */}
                {showBands && chartData.bandsD && (
                  <path 
                    d={chartData.bandsD}
                    fill="rgba(16, 185, 129, 0.04)"
                    stroke="rgba(16, 185, 129, 0.15)"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                )}

                {/* 2. 繪製動態雙軸 Y 刻度線 */}
                {chartData.ticksY.map((tick, i) => (
                  <g key={`y-${i}`} className="opacity-40 font-mono text-[10px]">
                    <line x1="0" y1={tick.y} x2={dimensions.width} y2={tick.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    <text x="6" y={tick.y - 4} fill="#94a3b8" textAnchor="start">{tick.label}</text>
                  </g>
                ))}

                {/* 3. 繪製動態雙軸 X 刻度線 */}
                {chartData.ticksX.map((tick, i) => (
                  <g key={`x-${i}`} className="opacity-40 font-mono text-[10px]">
                    <line x1={tick.x} y1="0" x2={tick.x} y2={dimensions.height} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    <text x={tick.x + 4} y={dimensions.height - 6} fill="#94a3b8" textAnchor="start">t = {tick.label}</text>
                  </g>
                ))}

                {/* W(t) = 0 基準水平線 (僅在標準維納過程模式下顯示，加入了陣列長度安全防禦) */}
                {!isGBM && chartData.ticksY && chartData.ticksY.length === 5 && (
                  <line 
                    x1="0" 
                    y1={dimensions.height - ((-parseFloat(chartData.ticksY[0].label)) / (parseFloat(chartData.ticksY[4].label) - parseFloat(chartData.ticksY[0].label))) * dimensions.height} 
                    x2={dimensions.width} 
                    y2={dimensions.height - ((-parseFloat(chartData.ticksY[0].label)) / (parseFloat(chartData.ticksY[4].label) - parseFloat(chartData.ticksY[0].label))) * dimensions.height} 
                    stroke="rgba(244,63,94,0.25)" 
                    strokeWidth="1.5"
                  />
                )}

                {/* 4. 繪製主隨機路徑線 */}
                <path 
                  d={chartData.pathD} 
                  fill="none" 
                  stroke={isGBM ? "#38bdf8" : "#10b981"} 
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                />
              </svg>
            </div>

            {/* 互動溫馨小提示 */}
            <div className="absolute bottom-4 right-4 text-slate-500 text-[11px] font-mono pointer-events-none bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800">
              🖱️ 滾輪/雙指縮放 | 👆 左右拖拽平移畫布
            </div>
          </div>
        </div>

        {/* 右側：高階參數控制面板 */}
        <div className="flex flex-col gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <Sliders className="w-4 h-4 text-emerald-400" /> 參數控制台
            </h3>
            
            <div className="space-y-4 font-mono text-xs">
              
              {/* GBM專屬參數面板 */}
              <div className={`space-y-4 p-3 rounded-lg border bg-slate-900/40 transition-all ${isGBM ? 'border-sky-500/30' : 'border-slate-800 opacity-40 pointer-events-none'}`}>
                <div className="flex items-center gap-1.5 text-sky-400 font-bold mb-1">
                  <TrendingUp className="w-3.5 h-3.5" /> 幾何布朗運動參數
                </div>
                
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>漂移率 (Drift μ):</span>
                    <span className="text-sky-400 font-bold">{(mu * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="-0.5" max="0.8" step="0.05" value={mu} 
                    onChange={(e) => setMu(parseFloat(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>波動度 (Volatility σ):</span>
                    <span className="text-sky-400 font-bold">{(sigma * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0.05" max="0.8" step="0.05" value={sigma} 
                    onChange={(e) => setSigma(parseFloat(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>初始價格 (S₀):</span>
                    <span className="text-sky-400 font-bold">{initialPrice}</span>
                  </div>
                  <input 
                    type="range" min="10" max="200" step="5" value={initialPrice} 
                    onChange={(e) => setInitialPrice(parseInt(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              {/* 顯示設定開關 */}
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-slate-400 cursor-pointer hover:text-slate-200">
                  <input 
                    type="checkbox" checked={showBands} 
                    onChange={(e) => setShowBands(e.target.checked)}
                    className="rounded accent-emerald-500" 
                  />
                  <span>顯示 95% 理論擴散邊界</span>
                </label>
              </div>

            </div>
          </div>

          {/* 操作按鈕群 */}
          <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
            <button 
              onClick={initData}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-all font-bold text-xs shadow-lg active:scale-98"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              重新生成隨機路徑 (Reset)
            </button>
            
            <button 
              onClick={() => setViewWindow({ start: 0, end: 1 })}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all font-bold text-xs border border-slate-700 active:scale-98"
            >
              <ZoomOut className="w-3.5 h-3.5 mr-2" />
              重置視野至 100% (Global View)
            </button>
          </div>
        </div>

      </div>

      {/* 學術補充說明註解區 */}
      <footer className="mt-6 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-3">
        <h4 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-emerald-400" /> 隨機分析與統計性質學術備忘錄 (Technical Insights)
        </h4>
        <p>
          當你不斷使用滑鼠滾輪放大本圖表時，你可以清晰觀測到隨機漫步的<strong>自相似性（Self-similarity）</strong>。本程式的「中央微觀斜率監測儀」會隨著時間跨度 $\Delta T \to 0$ 的縮小，呈現出斜率隨機跳動幅度呈指數型級數暴增（$\pm \infty$ 振盪）的現象，這在數學上具體展現了布朗運動<strong>處處連續但處處不可微分（Continuous but nowhere differentiable）</strong>的著名經典定理。
        </p>
        <p className="font-mono bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300 leading-relaxed">
          <strong>幾何布朗運動 (GBM) 邊界方程：</strong> 
          <br />
          Upper Band = S₀ · exp(μt + 2σ√t) 
          <br />
          Lower Band = S₀ · exp(μt - 2σ√t)
          <br />
          由於波動雜訊幅度的擴散擴張速度與 $\sqrt{dt}$ 成正比（速度遠快於與 $dt$ 成正比的漂移項），這正是導致微觀路徑無限崎嶇的數學源頭。
        </p>
      </footer>

      {/* 社群引流底部按鈕 */}
      <div className="mt-6 flex justify-center pb-4">
        <a 
          href="https://www.instagram.com/isjustfinance_" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-slate-950 border border-slate-800 rounded-full shadow-md text-slate-400 hover:text-pink-400 hover:border-pink-500/30 transition-all duration-300 text-xs font-semibold group"
        >
          {/* 使用原生 SVG 替代 Lucide 圖標，避開打包錯誤 */}
          <svg
            xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-3.5 h-3.5 group-hover:scale-110 transition-transform"
            >
               <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
               <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
               <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
            </svg>
            <span>Follow Theoretical Finance on IG: <span className="font-bold text-slate-200 group-hover:text-pink-400">@isjustfinance_</span></span>
        </a>
      </div>

    </div>
  );
};

export default App;