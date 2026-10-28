import React, { useState } from "react";
import { addQuestionAPI, uploadCSVAPI } from "../../services/adminService";
import "./AdminPages.css";

const EMPTY = {
  subject: "",
  topic: "",
  difficulty: "",
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: "",
  hint: "",
};

const AddQuestion = () => {
  const [formData, setFormData] = useState(EMPTY);
  const [csvFile, setCsvFile] = useState(null);
  const [message, setMessage] = useState({ text: "", ok: false });

  const say = (text, ok = false) => setMessage({ text, ok });

  const handleChange = (e, index = null) => {
    if (index !== null) {
      const newOptions = [...formData.options];
      newOptions[index] = e.target.value;
      setFormData({ ...formData, options: newOptions });
    } else {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  };

  const handleCSVChange = (e) => {
    setCsvFile(e.target.files[0] || null);
    // choosing a file clears the manual form (one way at a time)
    if (
      formData.subject ||
      formData.topic ||
      formData.questionText ||
      formData.options.some((opt) => opt !== "")
    ) {
      setFormData(EMPTY);
    }
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    if (csvFile) {
      say("Please either upload CSV or fill the manual form, not both.");
      return;
    }
    try {
      const res = await addQuestionAPI(formData);
      say(res.message || "Question added successfully!", true);
      setFormData(EMPTY);
    } catch (err) {
      say(err.message || "Failed to add question");
    }
  };

  const handleSubmitCSV = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      say("Please select a CSV file.");
      return;
    }
    try {
      const res = await uploadCSVAPI(csvFile);
      say(
        res.message || `CSV uploaded successfully! Inserted ${res.inserted || 0} questions.`,
        true
      );
      setCsvFile(null);
      e.target.reset();
    } catch (err) {
      say(err.message || "CSV upload failed");
    }
  };

  return (
    <div className="ap-page">
      <h2>Add question</h2>
      <p className="ap-sub">Write one question by hand, or upload many at once from a CSV file.</p>

      {message.text && (
        <div className={`ap-msg ${message.ok ? "ok" : "err"}`}>{message.text}</div>
      )}

      <div className="ap-split">
        {/* ───────── manual entry ───────── */}
        <form className="ap-card ap-form" onSubmit={handleSubmitManual}>
          <h3>Manual entry</h3>

          <div className="ap-two">
            <label>
              Subject
              <input type="text" name="subject" value={formData.subject} onChange={handleChange} required />
            </label>
            <label>
              Topic
              <input type="text" name="topic" value={formData.topic} onChange={handleChange} required />
            </label>
          </div>

          <label>
            Difficulty
            <select name="difficulty" value={formData.difficulty} onChange={handleChange} required>
              <option value="">Select difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label>
            Question
            <textarea name="questionText" value={formData.questionText} onChange={handleChange} required />
          </label>

          <div className="ap-two">
            {formData.options.map((opt, idx) => (
              <label key={idx}>
                Option {idx + 1}
                <input type="text" value={opt} onChange={(e) => handleChange(e, idx)} required />
              </label>
            ))}
          </div>

          <label>
            Correct answer
            <select name="correctAnswer" value={formData.correctAnswer} onChange={handleChange} required>
              <option value="">Which option is correct?</option>
              {[0, 1, 2, 3].map((i) => (
                <option key={i} value={String(i)}>Option {i + 1}</option>
              ))}
            </select>
          </label>

          <label>
            Hint (optional)
            <input type="text" name="hint" value={formData.hint} onChange={handleChange} placeholder="A nudge that does not give the answer away" />
          </label>

          <div className="ap-actions">
            <button type="submit" className="ap-btn">Add question</button>
          </div>
        </form>

        {/* ───────── CSV upload ───────── */}
        <form className="ap-card ap-form ap-file" onSubmit={handleSubmitCSV}>
          <h3>Upload CSV</h3>
          <p className="ap-sub">Add a whole batch in one go. Use either this or the form, not both.</p>
          <input type="file" accept=".csv" onChange={handleCSVChange} />
          <div className="ap-actions">
            <button type="submit" className="ap-btn" disabled={!csvFile}>Upload CSV</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddQuestion;