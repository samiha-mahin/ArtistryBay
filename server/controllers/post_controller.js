import sharp from "sharp";
import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post_model.js";
import { User } from "../models/user_model.js";
import { Comment } from "../models/comment_model.js";
import path from "path";

// Add new post
export const addNewPost = async (req, res) => {
    try {
        const { caption } = req.body;
        const image = req.file;
        const authorId = req.id;

        if (!image) return res.status(400).json({ message: 'Image required' });

        const optimizedImageBuffer = await sharp(image.buffer)
            .resize({ width: 800, height: 800, fit: 'inside' })
            .toFormat('jpeg', { quality: 80 })
            .toBuffer();

        const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString('base64')}`;
        const cloudResponse = await cloudinary.uploader.upload(fileUri);

        const post = await Post.create({
            caption,
            image: cloudResponse.secure_url,
            author: authorId
        });

        const user = await User.findById(authorId);
        if (user) {
            user.posts.push(post._id);
            await user.save();
        }

        await post.populate({ path: 'author', select: '-password' }); //Adds full author details (like username and profile) into the post object

        return res.status(201).json({
            message: 'New post added',
            post,
            success: true,
        });

    } catch (error) {
        return res.status(500).json({
            message: "Post failed.",
            error: error.message,
            success: false,
          });    
        }
};

// Get all posts
export const getAllPost = async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 }) // newest posts first
            .populate({ path: 'author', select: 'username profilePicture' }) // populate author details
            .populate({
                path: 'comments',
                sort: { createdAt: -1 }, // newest comments first
                populate: {
                    path: 'author',
                    select: 'username profilePicture'
                } // populate author of comments
            });
            return res.status(200).json({
                 posts,
                 success: true,
            });
    } catch (error) {
        return res.status(500).json({
            message: "getAllPost failed.",
            error: error.message,
            success: false,
          });  
    }
};

// Get current user's posts
export const getUserPost = async (req, res) => {
    try {
        const authorId = req.id;
        const posts = await Post.find({ author: authorId })
            .sort({ createdAt: -1 })
            .populate({
                path: 'author',
                select: 'username profilePicture'
            })
            .populate({
                path: 'comments',
                sort: { createdAt: -1 },
                populate: {
                    path: 'author',
                    select: 'username profilePicture'
                }
            });
        return res.status(200).json({ posts, success: true });
    } catch (error) {
        return res.status(500).json({
            message: "getUserPost failed.",
            error: error.message,
            success: false,
          });    
    }
};

// Like post
export const likePost = async (req, res) => {
    try {
        const userId = req.id;
        const postId = req.params.id;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found', success: false });

        await post.updateOne({ $addToSet: { likes: userId } }); //$addToSet is like saying: “Add user123 to the likes array only if not already there.” It prevents duplicate likes. So even if you spam the like button, your ID is only added once. 
        await post.save();

        return res.status(200).json({ message: 'Post liked', success: true });
    } catch (error) {
        return res.status(500).json({
            message: "likePost failed.",
            error: error.message,
            success: false,
          }); 
    }
};

// Dislike post
export const dislikePost = async (req, res) => {
    try {
        const userId = req.id;
        const postId = req.params.id;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found', success: false });

        await post.updateOne({ $pull: { likes: userId } });
        await post.save();

        return res.status(200).json({ message: 'Post disliked', success: true });
    } catch (error) {
        return res.status(500).json({
            message: "dislikePost failed.",
            error: error.message,
            success: false,
          }); 
    }
};

// Add comment to a post
export const addComment = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.id;
        const { text } = req.body;

        if (!text) return res.status(400).json({ message: 'Text is required', success: false });

        const post = await Post.findById(postId);
        const comment = await Comment.create({
            text,
            author: userId,
            post: postId
        });

        await comment.populate({ path: 'author', select: 'username profilePicture' });

        post.comments.push(comment._id);
        await post.save();

        return res.status(201).json({ message: 'Comment added', comment, success: true });
    } catch (error) {
        return res.status(500).json({
            message: "comment failed.",
            error: error.message,
            success: false,
          }); 
    }
};

// Get comments of a post
export const getCommentsOfPost = async (req, res) => {
    try {
        const postId = req.params.id;
        const comments = await Comment.find({ post: postId }).populate('author', 'username profilePicture');

        if (!comments) return res.status(404).json({ message: 'No comments found', success: false });

        return res.status(200).json({ success: true, comments });
    } catch (error) {
        return res.status(500).json({
            message: "getCommentsOfPost failed.",
            error: error.message,
            success: false,
          }); 
    }
};

// Delete a post
export const deletePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const authorId = req.id;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found', success: false });

        if (post.author.toString() !== authorId)
            return res.status(403).json({ message: 'Unauthorized' });

        await Post.findByIdAndDelete(postId);

        const user = await User.findById(authorId);
        user.posts = user.posts.filter(id => id.toString() !== postId);
        await user.save();

        await Comment.deleteMany({ post: postId });

        return res.status(200).json({ success: true, message: 'Post deleted' });
    } catch (error) {
        return res.status(500).json({
            message: "deletePost failed.",
            error: error.message,
            success: false,
          }); 
    }
};

// Bookmark or unbookmark a post
export const bookmarkPost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.id;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found', success: false });

        const user = await User.findById(userId);
        if (user.bookmarks.includes(post._id)) {
            await user.updateOne({ $pull: { bookmarks: post._id } });
            await user.save();
            return res.status(200).json({ type: 'unsaved', message: 'Post removed from bookmark', success: true });
        } else {
            await user.updateOne({ $addToSet: { bookmarks: post._id } });
            await user.save();
            return res.status(200).json({ type: 'saved', message: 'Post bookmarked', success: true });
        }
    } catch (error) {
        return res.status(500).json({
            message: "bookmarkPost failed.",
            error: error.message,
            success: false,
          }); 
    }
};
