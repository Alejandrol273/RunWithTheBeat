document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("runForm");

  form.addEventListener("submit", function (event) {
    event.preventDefault(); // stop the default form submission

    // Collect all user inputs into one object
    const runData = {
      genre: document.getElementById("genres").value,
      height: document.getElementById("height").value,
      distance: document.getElementById("distance").value,
      pace: document.getElementById("pace").value,
      time: document.getElementById("time").value,
    };

    // Save it so the second page can read it
    localStorage.setItem("runData", JSON.stringify(runData));

    // Go to the second page
    window.location.href = "second_page.html";
  });
});