# Agent eval: last run

2026-11-26 · model: Claude Code default · API: deployed API (HAKUBA_API_URL) · 41 questions

**40/41 passed** (0.98 ± 0.02 SE, 95% interval 0.87–1.00) · tool-call precision 0.94 (67/71) · recall 1.00 (61/61) · cost $2.02 ($0.049 per question, 41 of 41 reported) · median 15 s · tool errors 1

| id | lang | pass | tools called | missing | extra | answer check | turns | s | $ |
|---|---|---|---|---|---|---|---|---|---|
| bus-to-happo | zh | PASS | search_place, next_buses | - | - | ok (gives an 08:xx departure time) | 3 | 18 | 0.086 |
| plan-day-by-bus | en | PASS | search_place, rank_resorts, next_buses | - | - | ok (gives a bus time and says it is an estimate) | 4 | 20 | 0.088 |
| coord-no-search | en | PASS | rank_resorts | - | - | ok (names resorts, without a needless place search) | 2 | 13 | 0.057 |
| untimed-bus-afternoon | ja | PASS | search_place, next_buses, route | - | route | ok (gives the 15:18 departure and says it is from Iwatake (JR Hakuba's time is not published)) | 4 | 23 | 0.061 |
| rank-fresh-snow-night | zh | PASS | search_place, rank_resorts | - | - | ok (names a night-skiing resort + cm (live data, form only)) | 3 | 15 | 0.043 |
| rank-depth-from-hotel-hakuba | ja | PASS | search_place, rank_resorts | - | - | ok (names a resort + summit depth in cm (live data, form only)) | 3 | 15 | 0.037 |
| rank-depth-night | en | PASS | search_place, rank_resorts | - | - | ok (names a night-skiing resort + cm (live data, form only)) | 3 | 15 | 0.063 |
| rank-most-runs-tie | zh | PASS | search_place, rank_resorts | - | - | ok (names both Happo-One and Cortina (tie at 16)) | 3 | 19 | 0.067 |
| rank-vertical-night-coord | zh | PASS | rank_resorts | - | - | ok (names Goryu, 926 m) | 2 | 10 | 0.055 |
| rank-vertical-pass-hotel-hakuba | ja | PASS | search_place, rank_resorts | - | - | ok (names Happo-One, 1071 m) | 3 | 13 | 0.041 |
| rank-cheapest-ticket | en | PASS | search_place, rank_resorts | - | - | ok (names Jigatake, 5,500 yen) | 3 | 17 | 0.038 |
| rank-price-cortina-missing | en | PASS | search_place, rank_resorts | - | - | ok (Happo-One 9,800 yen; says Cortina has no price) | 3 | 16 | 0.045 |
| bus-station-happo-morning | en | PASS | search_place, next_buses | - | - | ok (08:13 from JR Hakuba Station, arriving 08:23) | 3 | 12 | 0.064 |
| bus-tokyu-happo-walk | en | PASS | search_place, next_buses | - | - | ok (walk ~10 min to Hakuba Happo Bus Terminal, 08:48 bus) | 3 | 12 | 0.059 |
| bus-preseason-no-service | en | PASS | search_place, next_buses, route, next_buses | - | - | ok (no service; first service day 2026-12-13) | 5 | 23 | 0.062 |
| bus-cortina-arrival | en | PASS | search_place, next_buses | - | - | ok (08:46 bus, arrives 09:28) | 3 | 16 | 0.058 |
| bus-last-back-to-station | en | PASS | search_place, search_place, next_buses, route | - | - | ok (says the tools only cover buses toward resorts) | 5 | 15 | 0.071 |
| bus-tsugaike-evening-untimed | en | PASS | search_place, next_buses | - | - | ok (17:46 from JR Hakuba Station, arrival time not published) | 3 | 18 | 0.056 |
| bus-omachi-kashimayari | zh | PASS | search_place, next_buses | - | - | ok (07:15 from JR Shinano-Omachi Station, arrives 08:00) | 3 | 16 | 0.038 |
| bus-goryu-afternoon-untimed | zh | PASS | search_place, next_buses | - | - | ok (untimed 15:03 from Iwatake, or the timed 16:42 arriving 17:23) | 3 | 16 | 0.065 |
| bus-season-over | zh | PASS | search_place, next_buses, route | - | route | ok (no service; next service day 2027-12-13) | 4 | 19 | 0.042 |
| bus-highland-sanosaka | zh | PASS | search_place, next_buses | - | - | ok (08:15 from the Hakuba Highland Hotel stop (0 min walk), arrives 08:50) | 3 | 15 | 0.064 |
| bus-opening-day-happo | zh | PASS | search_place, next_buses, route | - | route | ok (first bus 09:42 (arrives 09:53)) | 4 | 20 | 0.057 |
| bus-tokyu-tsugaike-own-stop | ja | PASS | search_place, next_buses | - | - | ok (09:05 from the Hakuba Tokyu Hotel stop, arrives 09:27) | 3 | 20 | 0.066 |
| bus-kamishiro-goryu | ja | PASS | search_place, next_buses | - | - | ok (walk ~15 min to ABLE Hakuba GORYU ESCAL PLAZA, 08:40 bus) | 3 | 14 | 0.062 |
| bus-late-evening-none | ja | FAIL | search_place, next_buses, next_buses | - | - | FAIL (says there is no bus at that hour) | 4 | 22 | 0.043 |
| bus-iwatake-arrival | ja | PASS | search_place, next_buses | - | - | ok (15:46 bus, arrives 15:55) | 3 | 14 | 0.049 |
| bus-gakuto-iwatake | ja | PASS | search_place, next_buses | - | - | ok (08:58 from the Gakuto Villas stop (arrives 09:05)) | 3 | 18 | 0.058 |
| route-station-to-hotel-hakuba-walk | en | PASS | search_place, search_place, route | - | - | ok (walk 10-13 min) | 4 | 15 | 0.043 |
| route-station-to-cortina-walk-too-long | zh | PASS | search_place, route, next_buses | - | next_buses | ok (walk ~143 min (2 h 23 min)) | 4 | 16 | 0.041 |
| route-echoland-to-happo-walk | ja | PASS | search_place, route | - | - | ok (walk 15-20 min) | 3 | 13 | 0.034 |
| route-kamishiro-station-to-goryu-walk | zh | PASS | search_place, search_place, route, route | - | - | ok (walk 13-17 min) | 5 | 21 | 0.039 |
| nodata-happo-crowd | en | PASS | - | - | - | ok (says it has no crowd data, without inventing a crowd level) | 1 | 6 | 0.029 |
| nodata-niseko-crowd | en | PASS | - | - | - | ok (says Niseko is not covered, without inventing a crowd level) | 1 | 7 | 0.025 |
| nodata-private-lesson | en | PASS | - | - | - | ok (says it cannot book lessons or price them, without a price) | 1 | 9 | 0.028 |
| nodata-nozawa-snow | zh | PASS | snow_conditions | - | - | ok (says Nozawa Onsen is not covered, without a depth) | 2 | 16 | 0.045 |
| nodata-bus-phone | zh | PASS | next_buses | - | - | ok (says it has no phone numbers, without inventing one) | 2 | 13 | 0.030 |
| nodata-rental-price | zh | PASS | - | - | - | ok (says it has no rental prices, without inventing one) | 1 | 8 | 0.028 |
| nodata-lift-refund | ja | PASS | - | - | - | ok (says it has no refund policy data, without inventing terms) | 1 | 10 | 0.031 |
| nodata-past-snow | ja | PASS | - | - | - | ok (says past snow is not available, without quoting a depth) | 1 | 8 | 0.027 |
| nodata-gondola-wind | ja | PASS | - | - | - | ok (says it has no lift operation data, without predicting) | 1 | 7 | 0.028 |

Answer excerpts:

- **bus-to-happo**: 2026-12-26 早上 8 點後，從白馬駅去八方尾根的接駁巴士： | 上車站 | 步行 | 發車 | 抵達八方 | 車程 | 路線 | |---|---|---|---|---|---| | **JR白馬駅** | 0 分 | **08:13** | 08:23 | 10 分 | 從Warabidaira發車，經白馬駅、八方口 | | Hotel Hakuba | 11.5 分 | 08:14 | 08:19 | 5 分 | 從Misorano發車，經八方口 | | **JR白馬駅** | 0 分 | **08:42** | 08:53 | 11 分 | Cortina ↔ 白馬五竜線 |
- **plan-day-by-bus**: I'd go to **Hakuba Happo-One**, and take the **08:13 bus from JR Hakuba Station**. **Why Happo-One:** It has the deepest snow in the valley right now, at **95 cm** at the summit. Next are Goryu and Hakuba47 at 75 cm each. These figures are from the forecast as of **today (26 Nov) at 16:00 JST**, so 
- **coord-no-search**: Here are the top 3 resorts by vertical drop from 36.6983,137.8619: | # | Resort | Vertical | Walk from you | Summit snow depth | New snow (24 h) | |---|---|---|---|---|---| | 1 | Hakuba Happo-One | 1,071 m | ~29 min | 95 cm | 0.8 cm | | 2 | ABLE Hakuba Goryu | 926 m | ~52 min | 75 cm | 0.4 cm | | 3 
- **untimed-bus-afternoon**: はい、2026-12-20の15時以降も便はありますが、時刻がはっきりしているのは16:42発です。 **JR白馬駅 → 八方尾根（Cortina ↔ Hakuba GORYU線）** | JR白馬駅 発 | 八方尾根 着 | 乗車時間 | 備考 | |---|---|---|---| | 15:18以降 | 不明 | 不明 | 時刻表には岩岳スノーフィールド発15:18の時刻しかありません。白馬駅に寄る時刻も、八方に着く時刻も載っていません。 | | **16:42** | **16:53** | 11分 | 時刻がわかっている便 | - この時刻は今季の公表版ではなく、昨シーズンの時刻表を
- **rank-fresh-snow-night**: 在有夜場的雪場中，新雪最多的是 **ABLE Hakuba GORYU（五竜）**，但只有約 **0.4 cm**，基本上等於沒有新雪。 | 排名 | 雪場 | 新雪 | 山頂積雪 | 從 Hakuba Tokyu Hotel 步行 | |---|---|---|---|---| | 1 | ABLE Hakuba GORYU | 0.4 cm | 75 cm | 約 63 分鐘 | | 2 | White Resort HAKUBA SANOSAKA | 0 cm | 15 cm | 約 112 分鐘 | | 3 | Jigatake Snow Resort | 0 cm | 15 cm |
- **rank-depth-from-hotel-hakuba**: 山頂の積雪が一番深いのは**白馬八方尾根スキー場**で、**95cm**です（11月26日16:00時点の予報モデルの値）。 - ホテル白馬から歩いて約19分です - 2位はエイブル白馬五竜と白馬47で、どちらも75cmです
- **rank-depth-night**: **ABLE Hakuba GORYU** has the deepest summit snow of the resorts with night skiing: **75 cm**. These figures are from the forecast model as of today, 26 Nov, 16:00 JST. | Resort | Summit depth | New snow (24 h) | Walk from hotel | |---|---|---|---| | ABLE Hakuba GORYU | 75 cm | 0.4 cm | ~67 min | | 
- **rank-most-runs-tie**: 從 JR 白馬駅出發，**白馬八方尾根（Happo-One）**和**白馬Cortina**並列第一，各有 **16 條**雪道。八方尾根離車站近很多，步行約 30 分鐘就到；Cortina 步行要 143 分鐘左右。 | 排名 | 雪場 | 雪道數 | 從白馬駅步行 | 山頂積雪 | |---|---|---|---|---| | 1 | 白馬八方尾根 | 16 | 約 30 分 | 95 cm | | 1 | 白馬Cortina | 16 | 約 143 分 | 20 cm | | 3 | ABLE 白馬五竜 | 15 | 約 49 分 | 75 cm | | 4 | 白馬乘鞍溫泉 | 1
- **rank-vertical-night-coord**: 在有夜間滑雪的雪場中，垂直落差最大的是 **ABLE Hakuba GORYU（白馬五竜），垂直落差 926 公尺**。 - 從你的位置步行約 52 分鐘可到。 - 山頂積雪 75 cm，過去 24 小時新雪 0.4 cm（資料時間：2026-11-26 16:00 JST）。 第二名是 White Resort HAKUBA SANOSAKA（白馬さのさか），460 公尺，步行約 98 分鐘。
- **rank-vertical-pass-hotel-hakuba**: ホテル白馬から行けるHakuba Valleyチケット対応のスキー場で、標高差が一番大きいのは**白馬八方尾根スキー場（Happo-One）で、1,071 m**です。ホテルから歩いて約19分で行けます。 | 順位 | スキー場 | 標高差 | 徒歩 | |---|---|---|---| | 1 | 白馬八方尾根 | 1,071 m | 約19分 | | 2 | エイブル白馬五竜 | 926 m | 約52分 | | 3 | 栂池高原 | 904 m | 約96分 | 八方尾根の積雪は、11/26 16:00時点の予報で山頂95 cm、過去24時間の新雪は0.8 cmです。
- **rank-cheapest-ticket**: **Jigatake Snow Resort** has the cheapest one-day lift ticket at **¥5,500**. The next cheapest are: - **White Resort Hakuba Sanosaka:** ¥5,700 - **Kashimayari Family Park:** ¥6,200 Jigatake is about 4.5 hours (269 min) on foot from JR Hakuba Station, so you'd need a bus or car. Sanosaka, at ¥200 mor
- **rank-price-cortina-missing**: I can only give you half the comparison. The tools have a price for Happo-One but none for Hakuba Cortina. | Resort | 1-day ticket | Walk from JR Hakuba Stn | |---|---|---| | **Happo-One** | **¥9,800** (cheapest day ticket listed) | ~30 min | | **Hakuba Cortina** | **No price listed** | ~143 min (to
- **bus-station-happo-morning**: Take the **08:13 bus from JR Hakuba Station**, on the route "From Warabidaira via JR Hakuba Sta.·Happo-guchi". It should reach **Happo-One at about 08:23**, a 10-minute ride. You board right at the station, so there's no walk. - **Backup:** the next bus from the station leaves at 08:42 (Cortina ↔ Ha
- **bus-tokyu-happo-walk**: On 2027-01-15, the first shuttle to Happo-One after 8:30 leaves from **Hakuba Happo Bus Terminal**: - **Walk:** about 10 min from Hakuba Tokyu Hotel. If you leave at 8:30, you'll get there around 8:40. - **Departs:** 08:48 on the Cortina ↔ Hakuba GORYU route - **Arrives at Happo-One:** 08:53 (5 min 
- **bus-preseason-no-service**: No, there's no shuttle bus on **Sat 2026-12-05**. The shuttle season is expected to start on **2026-12-13**. - **On Dec 5 you can walk** from JR Hakuba Station to the Happo-One base. It takes about **31 min (2.6 km)** along Route 148, so leave around 8:00 and you'll arrive around 8:30. - **From Dec 
- **bus-cortina-arrival**: You'd get to **Hakuba Cortina at about 09:28**. - **Bus:** Cortina ↔ Hakuba GORYU line, leaving **JR Hakuba Station at 08:46** - **Ride:** 42 min If you miss it, the next bus to Cortina leaves at **10:46** and gets there at 11:28. That leaves a 2-hour gap, so be at the stop in time for the 08:46. **
- **bus-last-back-to-station**: I can't give you that time. These tools only look up buses going *to* ski resorts. They can't search for buses to JR Hakuba Station, so I can't find the last bus from Happo-One back to the station on 2027-01-15. What I did find for that day: - **Buses are expected to run.** The times are projected f
- **bus-tsugaike-evening-untimed**: I can't give you an arrival time at Tsugaike. The timetable doesn't publish one for this route. These are the shuttles to Tsugaike (Cortina ↔ Hakuba GORYU route) on 2027-01-15 after 17:00: | Option | Departure time shown | Where that time applies | Arrives at Tsugaike | |---|---|---|---| | 1 | 17:10
- **bus-omachi-kashimayari**: 從 JR 信濃大町站去鹿島槍滑雪場，最早一班是 **07:15** 發車，**08:00** 到，車程 45 分鐘。巴士就在車站站牌上車，不用走路。 如果沒趕上，下一班是 **08:30** 發車，**09:15** 到。 這些時間是根據上一季時刻表推估的，2027 年 1 月的時刻表還沒公布，出發前請再確認一次。
- **bus-goryu-afternoon-untimed**: 有，2027-02-10 下午從 JR 白馬站有接駁巴士到白馬五竜（Cortina ↔ Hakuba GORYU 線），站牌就在車站，不用步行。 | 班次 | 時刻表上的發車時間 | 抵達五竜 | 乘車時間 | |---|---|---|---| | ① | 15:03 從**岩岳雪場**發車 | 未公布 | 未公布 | | ② | 15:18 從**岩岳雪場**發車 | 未公布 | 未公布 | | ③ | **16:42 從白馬站發車** | **17:23** | 41 分 | - **第①、② 班：** 時刻表只寫了岩岳的發車時間。巴士到白馬站一定會比這個時間晚，但時刻表上沒有寫幾點，到
- **bus-season-over**: **沒有。** 2027-04-10 當天白馬站沒有接駁巴士，那時這季的班次已經結束。下一個有班次的日子是 **2027-12-13**，這是根據上一季時刻表推估的，正式時刻表還沒公布。 **替代方案：** 從 JR 白馬站走到八方尾根的主要入口約 **2.6 km**，大概要 **31 分鐘**，主要沿著國道148號走。早上 8:00 出發的話，約 **8:31** 抵達。
- **bus-highland-sanosaka**: 2027-01-15 從白馬高原飯店去佐野坂的巴士如下： | 上車站 | 發車 | 抵達佐野坂 | 車程 | |---|---|---|---| | **飯店門口的 Hakuba Highland Hotel 站** | **08:15** | **08:50** | 35 分 | | 同一站 | 09:50 | 10:30 | 40 分 | - **要走多遠：** 不用走路，在飯店自己的巴士站上車就可以。 - **路線：** 從八方口・和田野（Happo-guchi·Warabidaira）發車，經五竜（Goryu）。 - **建議：** 08:15 那班錯過的話，下一班要等到 09:50，
- **bus-opening-day-happo**: 2026-12-13 早上 7:00 從 JR 白馬站出發，最早一班去八方尾根的接駁巴士是 **9:42**，**9:53** 到，車程 11 分鐘。 - 路線是 Cortina ↔ Hakuba GORYU，就在 JR 白馬站上車，不用走路。 - 下一班 10:42 開，10:53 到。 ⚠️ 這班時間是照上一季時刻表推算的，今季的時刻表還沒公布，出發前請再確認。 如果不想等到 9:42，也可以從白馬站走到八方尾根，大約 **31 分鐘（2.6 km）**，沿國道 148 號走，7:00 出發約 7:31 到。
- **bus-tokyu-tsugaike-own-stop**: **ホテル前（白馬東急ホテル）のバス停発の栂池高原行きは、2027-01-15 の 9:05 発 → 9:27 着（乗車22分）です。**「Sanroku発 Wadano経由」の路線です。 - 早く着きたい場合は、白馬八方バスターミナル（徒歩約12分）から 8:55 発 → 9:18 着（乗車23分）もあります。8:43ごろホテルを出れば間に合います。 - 2027年1月の時刻表はまだ発表されていません。この時刻は昨シーズンの時刻表からの見込みで、実際のバスの位置ではありません。発表後に確認してください。
- **bus-kamishiro-goryu**: JR神城駅から白馬五竜へは、**バスより歩くほうが早いです。** **ツールの結果（2027-01-20 8:00出発の場合）** - 乗車するバス停：**ABLE白馬五竜 エスカルプラザ**（神城駅から徒歩約15分） - 五竜行きのバス：**8:40発 → 8:45着**（乗車5分）。次の便は 9:15発 → 9:20着です。 - 路線：白馬47・白馬五竜（いいもり＆エスカルプラザ） **注意点** - このバス停のエスカルプラザは、白馬五竜のメインベースそのものです。神城駅から約15分歩けば、8:15ごろにはもうゲレンデに着きます。バスに乗るのは、五竜の**いいもり**エリアへ移動したい場
- **bus-late-evening-none**: **いいえ、2027年1月15日21時ごろにJR白馬駅からスキー場へ行くシャトルバスはありません。** - 運行期間中の日ですが、21:00以降にJR白馬駅から出る便は、どのスキー場行きも見つかりませんでした。 - 18:00以降で調べても便はありませんでした。その日の駅発の便は夕方までに終わる見込みです。 - この結果は昨シーズンの時刻表をもとにした予測です。2026-27シーズンの時刻表はまだ公開されていないので、公開されたら確認してください。 その時間にナイター営業のスキー場へ行くなら、タクシーなどほかの交通手段を考えてください。夕方の最終便を調べることもできます。
- **bus-iwatake-arrival**: 2027年2月10日の15時にJR白馬駅にいる場合、白馬岩岳には**15:55に着きます**。乗り換えはありません。 - **乗るバス:** JR白馬駅を15:46に出る「Cortina ↔ Hakuba GORYU」線 - **乗車時間:** 9分 - **乗り遅れたら:** 次は16:46発で、16:55に着きます この時刻は2026/27シーズンの時刻表がまだ出ていないため、昨シーズンの時刻表から予測したものです。時刻表どおりの目安で、実際の運行状況ではありません。乗る前に最新の時刻表を確認してください。 着くのは夕方なので、岩岳でまだ滑れるかどうかは営業時間を確認してください。
- **bus-gakuto-iwatake**: **はい、あります。** 宿の前の「ガクトヴィラ」バス停から岩岳へ直通のバスが出ます。 - **8:58発 → 9:05岩岳着**（乗車7分、「和田野発」路線） もう一つの方法として、八方バスターミナルまで歩いて（約14分）**8:55発**に乗ると**9:03着**です。着くのは2分早いだけなので、宿の前から乗る方が楽です。 注意点：2027年1月の時刻表はまだ発表されていません。上の時刻は昨シーズンの時刻表から見込んだものです。時刻表の上の目安でもあるので、新しい時刻表が出たら確かめて、数分早めにバス停で待つと安心です。
- **route-station-to-hotel-hakuba-walk**: Yes, you can walk it. It's about **1.0 km and roughly 12 minutes** on foot (11.5 min), mostly along Route 148 (国道148号). - **Luggage:** that time is for walking without bags. With a suitcase, plan on about **15–20 minutes**. - **Snow:** if there's snow or slush on the sidewalks, wheeled suitcases get
- **route-station-to-cortina-walk-too-long**: 從JR白馬站走到白馬Cortina滑雪場大約要**143分鐘（約2小時23分）**，距離約**12.2 km**，沿國道148號和千國北城線走。 這段距離太遠，背著雪具不建議走路去。不過接駁巴士現在還沒開，預計**2026-12-13**開始營運。這個日期是依照上一季推估的，今年的時刻表還沒公布。如果你要在那天之後去，可以跟我說日期和時間，我幫你查班次。
- **route-echoland-to-happo-walk**: エコーランドから八方尾根のメインベースまでは、**歩いて約18分（1.6km）**です。 - 計測の起点はバス停「エコーランドメイン通り」です。 - 細野節などの道を通るルートです。 スキー靴を履いていたり板を持っていたりすると、もっと時間がかかります。シャトルバスの時刻も調べられます。
- **route-kamishiro-station-to-goryu-walk**: 從JR神城站走到白馬五龍滑雪場的主要入口，大約要 **15 分鐘**，距離約 **1.2 公里**。 這是路線規劃估算的時間，實際會受積雪路況和行李重量影響。如果背著滑雪板或雪板，最好多留幾分鐘。
- **nodata-happo-crowd**: I can't tell you how busy Happo-One will be. None of my Hakuba tools have crowd or lift-queue data, so any number I gave you would be a guess. The calendar does help a little. Wednesday 2027-01-13 is a weekday, two days after the Coming of Age Day long weekend (Monday 2027-01-11). Japanese holiday t
- **nodata-niseko-crowd**: I can't help with that one, for two reasons: 1. **Niseko isn't covered.** It's in Hokkaido, and my tools only cover the 10 resorts in Hakuba Valley (Nagano). 2. **I have no crowd data** for any resort, so I can't predict how busy a slope will be on a given day, even in Hakuba. For Hakuba on 2027-01-
- **nodata-private-lesson**: I can't book a private lesson at Happo-One for 2027-01-14, and I can't tell you what one costs. My Hakuba tools only do bus times, walking routes, snow conditions and resort rankings. They can't make bookings and have no ski school prices. To book, contact a Happo-One ski school directly, either on 
- **nodata-nozawa-snow**: 我查不到野澤溫泉的積雪資料。我的工具只涵蓋白馬山谷的10個雪場，野澤溫泉不在其中，所以我無法提供它的數據。 作為參考，以下是白馬山谷各雪場的積雪。這些是模型預報值，不是雪場實測，時間為 **2026-11-26 16:00 (JST)**： | 雪場 | 山頂積雪 | 山腳積雪 | 未來72小時新雪 | |---|---|---|---| | 八方尾根 (Happo-one) | 95 cm | 7 cm | 54.7 cm | | 五竜 (Goryu) | 75 cm | 7 cm | 39.7 cm | | 白馬47 | 75 cm | 7 cm | 39.6 cm | | 栂池 (Tsu
- **nodata-bus-phone**: 我手上的白馬工具只有巴士時刻、路線、雪況和雪場資料，**沒有巴士公司的客服電話**，所以我沒辦法告訴你號碼，也不想亂猜。建議你查 Hakuba Valley 官網，或直接問飯店櫃台。 我查到的是：**現在（11/26）接駁巴士還沒開始營運**，預計 **2026-12-13** 開始。這個日期是根據上一季時刻表推算的，今季的時刻表還沒公布。 需要的話，我可以幫你查從你住的飯店出發的班次和到各雪場的時間。
- **nodata-rental-price**: 我這邊的 Hakuba 工具查不到八方尾根的雪板和雪鞋租借價格。這些工具只有接駁巴士時刻、步行時間、雪況，以及雪場的基本資料，包括雪道數、面積、落差和最便宜的一日券票價，沒有租借店的價目。 要查租借價格，可以： - 到八方尾根官網的租借頁面查，或直接問當地租借店（八方的店很多，價格差異也大）。 - 問你住的飯店，很多飯店跟租借店合作，有折扣或提供接送。 我可以幫你查八方尾根的一日券價格、從你住的地方搭巴士或走路過去要多久，或者最近的雪況。告訴我你住哪家飯店就行。
- **nodata-lift-refund**: 申し訳ありませんが、八方尾根のリフト券を払い戻しできるかどうかは確認できません。私が使えるツールで調べられるのは、シャトルバスの時刻、徒歩ルート、積雪、リゾートの比較だけで、払い戻しの規定は分かりません。 規定は券の種類や止まった時間によって違うことが多いので、次の方法で確認するのが確実です。 - **八方尾根の公式サイト**で、券売・払い戻しの規定を見る - **当日に**ベースのチケット窓口で聞く。運休が分かった時点で、購入時のレシートとリフト券を持って行くと話が早いです - **Hakuba Valley共通券**の場合は、その券の販売元の規定も確認する 強風の日は、風の影響を受けにくい
- **nodata-past-snow**: 2026-02-01の八方尾根の積雪は、お答えできません。使えるツールでは過去の記録が見られず、現在の予報モデル（Open-Meteo）による最新の積雪しか分からないためです。 過去の値を調べるなら、八方尾根スキー場の公式サイトや日本気象協会（tenki.jp）などの過去データを見てください。 今の八方尾根の積雪（山頂cm）や新雪量なら確認できます。必要なら言ってください。
- **nodata-gondola-wind**: **わかりません。** 使えるツールには風の予報もゴンドラ・リフトの運行状況もないので、2027-01-13に強風で運休するかは判断できません。しかも1か月半以上先なので、どの天気予報でもまだ確かなことは言えません。 当日の運行状況は、前日か当日の朝に八方尾根スキー場の公式サイトかSNSで確認してください。 代わりに私が調べられるもの： - **シャトルバスの時刻**：その日の朝、ホテルから八方や他のスキー場へ行くバス（12月20日以降の日付に対応） - **代わりのスキー場**：もし八方が運休したときの候補（ホテルからの近さ、積雪、料金などで比べられます） ホテル名を教えてもらえれば、1/1
