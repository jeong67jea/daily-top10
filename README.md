# GitHub Pages 자동 배포 — Node + OpenAI (No Python)
이 저장소는 RSS를 읽어 OpenAI 요약으로 **index.html**을 생성하고, GitHub Pages로 호스팅합니다.

## 빠른 시작
1) 이 폴더 전체를 새 GitHub 저장소에 업로드 (예: `daily-top10`)
2) 저장소 > Settings > Pages > Source: `Deploy from a branch`, Branch: `main`, Folder: `/ (root)`
3) Settings > Secrets and variables > Actions > **New repository secret**
   - Name: `OPENAI_API_KEY`
   - Value: (OpenAI 키 `sk-...`)
4) Actions 탭에서 `Build & Deploy Top10 (Node)` 워크플로우 **Run workflow** (또는 매일 08:20 KST 자동 실행)
5) 배포 주소: `https://USERNAME.github.io/daily-top10/` (index.html 자동 제공)

## 로컬 수동 빌드(선택)
```
npm ci
# Windows PowerShell
$Env:OPENAI_API_KEY="sk-..." ; npm run build
# macOS/Linux
OPENAI_API_KEY="sk-..." npm run build
# → index.html 생성됨 (커밋/푸시하면 Pages 자동 반영)
```

## 커스터마이즈
- 피드 수정: `sources.json`
- OG 이미지/URL: `public/template.html` 의 `og:image`, `og:url`에서 USERNAME을 본인 계정으로 변경
- 모델: 워크플로우 env의 `OPENAI_MODEL`
- 키워드/스코어링: `scripts/build.mjs` 상단 설정 수정
