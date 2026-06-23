@echo off
echo  TAM PERSONAL ASSISTANT DEPLOYER 
echo.
set /p REPO_URL="Enter your GitHub Repository URL: "
git init
git add .
git commit -m "Initial commit for TAM Personal Assistant"
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main -f
echo.
echo  Pushed successfully! Now go to Render and link this repo.
pause
