# 股價不可微分性質視覺化展示實驗室

這是一個基於 **React** 與 **Vite** 建構的動態隨機分析可視化工具。
專案利用**布朗橋動態中點置換法（Brownian Bridge Midpoint Displacement）**，在微觀尺度下即時生成碎形細節，藉此驗證資產價格在連續時間模型中的核心物理性質。

Website: https://wesley1110.github.io/wiener-process-non-differentiable/

### 📊 核心功能
* **標準維納過程 $W(t)$ 與幾何布朗運動 $S(t)$** 雙模式即時切換。
* **微觀局部斜率監測儀**：捕捉畫面中央相鄰兩點之 $\frac{\Delta Y}{\Delta T}$，親眼見證時間跨度趨近於零時，斜率朝 $\pm\infty$ 劇烈振盪的「處處不可微分」鐵證。
* **95% 理論擴散邊界**：結合漂移率（Drift）與波動度（Volatility），動態呈現股價在隨機漫步下，隨時間擴散的 95% 信賴區間。
* 支援滑鼠滾輪以游標為中心進行無窮放大，以及按住滑鼠左鍵進行拖拽平移（Pan）。

### 📱
Instagram 財金學術知識帳號：[@isjustfinance_](https://www.instagram.com/isjustfinance_)