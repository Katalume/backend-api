const mongoose = require('mongoose');
const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../src/config/.env') });
// Fallback if .env is in root
if (!process.env.MONGO_URI) {
    dotenv.config({ path: path.join(__dirname, '../.env') });
}

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/katalume');
    console.log('Connected to MongoDB');

    const title = 'Two Sum';
    const slug = 'two-sum';

    // Check if exists
    let problem = await Problem.findOne({ slug });
    if (problem) {
      console.log('Problem already exists');
      process.exit(0);
    }

    // Create Problem
    problem = new Problem({
      title,
      slug,
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
      difficulty: 'Easy',
      tags: ['Array', 'Hash Table'],
      sampleTestCases: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]',
          explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
        }
      ]
    });
    await problem.save();
    console.log('Problem created');

    // Create Testcases
    // Note: Judge0 expects stdin. For Two Sum in Python, we might need a driver code or parse input.
    // To keep it simple for this MVP, let's assume the user writes a function and we append driver code, 
    // OR the user writes a script that reads from stdin.
    // Let's assume the user writes a script that reads from stdin.
    // Input format:
    // Line 1: target
    // Line 2: space separated nums
    
    const testcases = [
      {
        problemId: problem._id,
        input: '9\n2 7 11 15',
        expectedOutput: '[0, 1]',
        isPublic: true
      },
      {
        problemId: problem._id,
        input: '6\n3 2 4',
        expectedOutput: '[1, 2]',
        isPublic: true
      },
      {
        problemId: problem._id,
        input: '6\n3 3',
        expectedOutput: '[0, 1]',
        isPublic: false
      }
    ];

    await Testcase.insertMany(testcases);
    console.log('Testcases created');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding:', error);
    process.exit(1);
  }
};

seed();
