document.addEventListener("DOMContentLoaded", function () {
  const runData = JSON.parse(localStorage.getItem("runData"));

  if (runData) {
    console.log("Genre:", runData.genre);
    console.log("Height:", runData.height);
    console.log("Distance:", runData.distance);
    console.log("Pace:", runData.pace);
    console.log("Time:", runData.time);
  }
});