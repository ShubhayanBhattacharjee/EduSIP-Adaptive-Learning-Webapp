// src/components/admin/AddQuestion.jsx
import React, { useState } from "react";
import { addQuestionAPI, uploadCSVAPI } from "../../services/adminService";
import "./AddQuestion.css";

const AddQuestion = () => {
  const [formData, setFormData] = useState({
    subject: "",
    topic: "",
    difficulty: "",
    questionText: "",
    options: ["", "", "", ""],
    correctAnswer: "",
    hint: "",
  });

  const [csvFile, setCsvFile] = useState(null);
  const [message, setMessage] = useState("");

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
    setCsvFile(e.target.files[0]);
    if (
      formData.subject ||
      formData.topic ||
      formData.questionText ||
      formData.options.some((opt) => opt !== "")
    ) {
      setFormData({
        subject: "",
        topic: "",
        difficulty: "",
        questionText: "",
        options: ["", "", "", ""],
        correctAnswer: "",
        hint: "",
      });
    }
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    if (csvFile) {
      setMessage("Please either upload CSV or fill the manual form, not both.");
      return;
    }
    try {
      const res = await addQuestionAPI(formData);
      setMessage(res.message || "Question added successfully!");
      setFormData({
        subject: "",
        topic: "",
        difficulty: "",
        questionText: "",
        options: ["", "", "", ""],
        correctAnswer: "",
        hint: "",
      });
    } catch (err) {
      setMessage(err.message || "Failed to add question");
    }
  };

  const handleSubmitCSV = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      setMessage("Please select a CSV file.");
      return;
    }
    try {
      const res = await uploadCSVAPI(csvFile);
      setMessage(
        res.message ||
          `CSV uploaded successfully! Inserted ${res.inserted || 0} questions.`
      );
      setCsvFile(null);
    } catch (err) {
      setMessage(err.message || "CSV upload failed");
    }
  };

  return (
    <div className="add-wrapper">
      <div className="add-question-card">
        <div className="right-panel">
          {message && <div className="error-message" style={{ margin: "28px 36px 0" }}>{message}</div>}

          {/* Manual Entry */}
          <form onSubmit={handleSubmitManual}>
            <h3>Manual Entry</h3>

            <input
              type="text"
              name="subject"
              placeholder="Subject"
              value={formData.subject}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="topic"
              placeholder="Topic"
              value={formData.topic}
              onChange={handleChange}
              required
            />
            <select
              name="difficulty"
              value={formData.difficulty}
              onChange={handleChange}
              required
            >
              <option value="">Select Difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <textarea
              name="questionText"
              placeholder="Question text"
              value={formData.questionText}
              onChange={handleChange}
              required
            />
            {formData.options.map((opt, idx) => (
              <input
                key={idx}
                type="text"
                value={opt}
                placeholder={`Option ${idx + 1}`}
                onChange={(e) => handleChange(e, idx)}
                required
              />
            ))}
            <input
              type="text"
              name="correctAnswer"
              placeholder="Correct option index (0–3)"
              value={formData.correctAnswer}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="hint"
              placeholder="Hint (optional)"
              value={formData.hint}
              onChange={handleChange}
            />
            <button type="submit">Add Question</button>
          </form>

          {/* Divider */}
          <div className="divider" style={{ margin: "0 36px" }}>
            <span>OR</span>
          </div>

          {/* CSV Upload */}
          <form onSubmit={handleSubmitCSV}>
            <h3>Upload CSV</h3>
            <input type="file" accept=".csv" onChange={handleCSVChange} />
            <button type="submit">Upload CSV</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddQuestion;