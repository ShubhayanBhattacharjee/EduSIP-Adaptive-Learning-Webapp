import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Hero from "./Hero";
import TeamSection from "./TeamSection";

import "./Home.css";

gsap.registerPlugin(ScrollTrigger);

const Home = () => {
  const location = useLocation();

  // Navbar animation
  useEffect(() => {
    gsap.fromTo(
      ".navbar",
      { y: -80, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        ease: "power2.out",
        delay: 0.2,
      },
    );

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  // Scroll to section when coming from another page
  useEffect(() => {
    if (location.state?.scrollTo) {
      const element = document.getElementById(location.state.scrollTo);

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  }, [location]);

  return (
    <>
      <div className="home">
        <Hero />
        <TeamSection />
      </div>
    </>
  );
};

export default Home;
